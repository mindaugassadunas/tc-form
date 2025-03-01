import { ConditionalFieldConfig, FormConfig } from '../models/formTypes';
import { FormValidator } from '../validation/FormValidator';
import { FormState } from '../models/formTypes';
import { FormStateManager } from '../managers/FormStateManager';
import { StorageManager } from '../utils/storage';
import { ConditionalFieldManager } from '../managers/ConditionalFieldManager';

export interface FormSubmitData {
  formData: Record<string, any>;
  state: FormState;
}

export abstract class BaseForm {
  protected wrapper: HTMLElement;
  protected form: HTMLFormElement;
  protected config: FormConfig;
  protected validator: FormValidator;
  protected stateManager: FormStateManager;
  protected conditionalManager!: ConditionalFieldManager;

  // UI Elements cache
  protected submitButton: HTMLButtonElement | null = null;
  protected errorContainer: HTMLElement | null = null;
  protected loadingIndicator: HTMLElement | null = null;

  constructor(wrapper: HTMLElement, form: HTMLFormElement, config: FormConfig) {
    this.wrapper = wrapper;
    this.form = form;
    this.config = config;

    // Initialize validator
    this.validator = new FormValidator(`#${form.id}`);

    // Initialize state manager with field IDs from the form
    const fieldIds = Array.from(form.elements)
      .filter(element => element instanceof HTMLElement && element.id)
      .map(element => (element as HTMLElement).id);

    this.stateManager = new FormStateManager(fieldIds);

    // Initialize conditional field manager after state manager and validator
    this.conditionalManager = new ConditionalFieldManager(
      this.form,
      this.stateManager,
      this.validator,
    );

    // Initialize form
    this.init();
  }

  protected init(): void {
    this.createHiddenFields();

    // Prefill if needed
    if (this.config.storage) {
      StorageManager.prefillForm(this.form, this.config.storage);
    }

    this.initializeValidator();
    this.cacheUIElements();
    this.setupEventListeners();
    this.stateManager.subscribe(this.handleStateChange.bind(this));

    // Initialize form data from URL params if needed
    this.initializeFromURL();

    // Trigger initial validation
    // this.validateForm();

    // Set up conditional fields
    this.initializeConditionalFields();
  }

  protected async createHiddenFields(): Promise<void> {
    if (!this.config.hiddenFields) return;

    const timeout = 500;

    await Promise.all(
      this.config.hiddenFields.map(async fieldConfig => {
        // Create hidden input
        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.id = fieldConfig.name;
        hiddenInput.name = fieldConfig.name;

        // Get value with timeout
        const value = await StorageManager.getValue(fieldConfig, timeout);
        if (value) {
          hiddenInput.value = value;

          // Add to state manager
          this.stateManager.setFieldValue(fieldConfig.name, value);
        }

        // Add to form
        this.form.appendChild(hiddenInput);
      }),
    );
  }

  protected cacheUIElements(): void {
    this.submitButton = this.form.querySelector('[type="submit"]');
    this.errorContainer = this.wrapper.querySelector('[data-error-container]');
    this.loadingIndicator = this.wrapper.querySelector('[data-loading]');
  }

  protected setupEventListeners(): void {
    // Form-level events
    this.form.addEventListener('submit', this.handleSubmit.bind(this));
    this.form.addEventListener('reset', this.handleReset.bind(this));

    // Field-level events
    const fields = Array.from(
      this.form.querySelectorAll<HTMLElement>('input, select, textarea'),
    );

    fields.forEach(field => {
      // Input event for real-time validation
      field.addEventListener('input', this.handleFieldInput.bind(this));

      // Blur event for touched state
      field.addEventListener('blur', this.handleFieldBlur.bind(this));

      // Change event for select elements
      if (field instanceof HTMLSelectElement) {
        field.addEventListener('change', this.handleFieldChange.bind(this));
      }
    });

    if (this.config.storage?.storeMode === 'live') {
      const fields = Array.from(
        this.form.querySelectorAll<HTMLElement>('input, select, textarea'),
      );

      fields.forEach(field => {
        field.addEventListener('blur', () => {
          StorageManager.storeFormData(this.form, this.config.storage!);
        });
      });
    }
  }

  protected initializeValidator(): void {
    if (!this.form) {
      console.error('Form element not found');
      return;
    }

    this.validator.initialize(this.form);
  }

  protected initializeFromURL(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const fields = Array.from(this.form.elements) as HTMLFormElement[];

    fields.forEach(field => {
      if (field.id && urlParams.has(field.id)) {
        const value = urlParams.get(field.id);
        if (value) {
          field.value = value;
          this.stateManager.setFieldValue(field.id, value);
        }
      }
    });
  }

  protected async handleFieldInput(e: Event): Promise<void> {
    const field = e.target as HTMLInputElement;
    if (!field.id) return;

    this.stateManager.setFieldValue(field.id, field.value);
    if (this.shouldValidateOnInput(field)) {
      await this.validateField(field);
    }
  }

  protected handleFieldBlur(e: Event): void {
    const field = e.target as HTMLInputElement;
    console.log('Blurred field:', field.id);
    if (!field.id) return;

    // Mark as touched
    this.stateManager.setFieldTouched(field.id);

    // Always validate on blur
    this.validateField(field);
  }

  protected handleFieldChange(e: Event): void {
    const field = e.target as HTMLSelectElement;
    if (!field.id) return;

    this.stateManager.setFieldValue(field.id, field.value);

    // Validate immediately for select elements
    this.validateField(field);
  }

  protected shouldValidateOnInput(field: HTMLInputElement): boolean {
    // Add your validation strategy here
    // For example, only validate after field has been touched
    const fieldState = this.stateManager.getFieldState(field.id);
    return fieldState?.isTouched || false;
  }

  protected async validateField(field: HTMLElement): Promise<boolean> {
    const fieldId = field.id;
    const fieldState = this.stateManager.getFieldState(fieldId);

    console.log(
      'Validating field:',
      field.id,
      'isVisible?',
      fieldState?.isVisible,
      fieldState,
    );

    // Skip validation for explicitly hidden fields (undefined means visible)
    if (fieldState?.isVisible === false) {
      return true;
    }

    return await this.validator.executeFieldValidation(field);
  }

  protected async validateForm(): Promise<boolean> {
    try {
      const validatableFields = Array.from(this.form.elements).filter(
        element => {
          // Exclude buttons and elements without IDs
          if (element instanceof HTMLButtonElement) return false;
          if (!(element instanceof HTMLElement) || !element.id) return false;

          const fieldId = (element as HTMLElement).id;
          const fieldState = this.stateManager.getFieldState(fieldId);

          // Only include visible fields that are actual form controls
          return (
            fieldState?.isVisible !== false &&
            (element instanceof HTMLInputElement ||
              element instanceof HTMLSelectElement ||
              element instanceof HTMLTextAreaElement)
          );
        },
      );

      // Add null check and default to false if undefined
      const isValid =
        (await this.validator.validateFields(validatableFields as Element[])) ??
        false;

      return isValid;
    } catch (error) {
      console.error('Error validating form:', error);
      return false;
    }
  }

  protected async handleSubmit(e: Event): Promise<void> {
    e.preventDefault();

    // Start submission process
    this.stateManager.startSubmission();
    this.updateUIForSubmission(true);

    try {
      // Validate all fields
      const isValid = await this.validateForm();
      if (!isValid) {
        this.handleValidationError();
        return;
      }

      // Collect form data
      const submitData = this.collectFormData();

      // Store to localstorage
      if (this.config.storage?.storeMode === 'submit') {
        StorageManager.storeFormData(this.form, this.config.storage);
      }

      // Submit the form
      await this.submitForm(submitData);

      // Clear stored data after successful submission
      if (this.config.storage) {
        StorageManager.clearStoredFormData(this.config.storage.key);
      }

      // Handle success
      this.handleSubmitSuccess();
    } catch (error) {
      // Handle error
      this.handleSubmitError(error);
    } finally {
      // End submission process
      this.stateManager.endSubmission();
      this.updateUIForSubmission(false);
    }
  }

  protected handleReset(e: Event): void {
    e.preventDefault();

    // Reset form state
    this.stateManager.resetForm();

    // Reset actual form
    this.form.reset();

    // Clear validation state
    this.validator.clearValidationState();

    // Reset UI
    this.updateUI(this.stateManager.getState());
  }

  protected handleStateChange(state: FormState): void {
    this.updateUI(state);
  }

  protected updateUI(state: FormState): void {
    this.updateFieldsUI(state);
    this.updateSubmitButton(state);
    this.updateErrorContainer(state);
  }

  protected updateFieldsUI(state: FormState): void {
    Object.entries(state.fields).forEach(([fieldId, fieldState]) => {
      const field = document.getElementById(fieldId);
      if (!field) return;

      // Update classes
      field.classList.toggle(
        'is-invalid',
        !fieldState.isValid && fieldState.isTouched,
      );
      field.classList.toggle(
        'is-valid',
        fieldState.isValid && fieldState.isTouched,
      );
      field.classList.toggle('is-dirty', fieldState.isDirty);

      // Update error messages
      this.updateFieldErrors(fieldId, fieldState.errors);
    });
  }

  protected updateSubmitButton(state: FormState): void {
    if (this.submitButton) {
      this.submitButton.disabled = !state.isValid || state.isSubmitting;
    }
  }

  protected updateErrorContainer(state: FormState): void {
    if (!this.errorContainer) return;

    const hasErrors = Object.values(state.fields).some(
      field => !field.isValid && field.isTouched,
    );

    this.errorContainer.style.display = hasErrors ? 'block' : 'none';
  }

  protected updateUIForSubmission(isSubmitting: boolean): void {
    if (this.submitButton) {
      this.submitButton.disabled = isSubmitting;
    }

    if (this.loadingIndicator) {
      this.loadingIndicator.style.display = isSubmitting ? 'block' : 'none';
    }
  }

  protected updateFieldErrors(fieldId: string, errors: string[]): void {
    const errorContainer = this.wrapper.querySelector(
      `[data-error-for="${fieldId}"]`,
    );

    if (errorContainer instanceof HTMLElement) {
      errorContainer.textContent = errors.join(', ');
      errorContainer.style.display = errors.length ? 'block' : 'none';
    }
  }

  protected collectFormData(): FormSubmitData {
    const formData = new FormData(this.form);
    const data: Record<string, any> = {};

    formData.forEach((value, key) => {
      data[key] = value;
    });

    return {
      formData: data,
      state: this.stateManager.getState(),
    };
  }

  protected async submitForm(submitData: FormSubmitData): Promise<void> {
    if (!this.config.action) {
      throw new Error('No action URL provided in form configuration.');
    }

    const response = await fetch(this.config.action, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(submitData.formData),
    });

    if (!response.ok) {
      throw new Error('Form submission failed');
    }
  }

  protected handleValidationError(): void {
    // Focus first invalid field
    const firstInvalidField = Object.entries(
      this.stateManager.getState().fields,
    ).find(([_, state]) => !state.isValid)?.[0];

    if (firstInvalidField) {
      const field = document.getElementById(firstInvalidField);
      field?.focus();
    }
  }

  protected handleSubmitSuccess(): void {
    // Reset form after successful submission
    this.stateManager.resetForm();
    this.form.reset();
    this.validator.clearValidationState();

    // Show success message or redirect
    if (this.config.successMessage) {
      alert(this.config.successMessage);
    }

    if (this.config.successRedirect) {
      window.location.href = this.config.successRedirect;
    }
  }

  protected handleSubmitError(error: any): void {
    console.error('Form submission error:', error);

    // Show error message
    if (this.errorContainer) {
      this.errorContainer.textContent =
        this.config.errorMessage || 'An error occurred. Please try again.';
      this.errorContainer.style.display = 'block';
    }
  }

  // Public methods for external use
  public reset(): void {
    this.handleReset(new Event('reset'));
  }

  public async validate(): Promise<boolean> {
    return await this.validateForm();
  }

  public getState(): FormState {
    return this.stateManager.getState();
  }

  // Conditional fields
  protected initializeConditionalFields(): void {
    // First, initialize all fields with isVisible: true
    const allFields = this.form.querySelectorAll('input, select, textarea');
    allFields.forEach(field => {
      if (field instanceof HTMLElement && field.id) {
        this.stateManager.updateState({
          fields: {
            [field.id]: {
              ...this.stateManager.getFieldState(field.id),
              isVisible: true,
              value: (field as HTMLInputElement).value || '',
              isDirty: false,
              isTouched: false,
              isValid: true,
              errors: [],
              isDisabled: false,
            },
          },
        });
      }
    });

    // Then process conditional fields
    if (this.config.conditionalFields) {
      this.config.conditionalFields.forEach(fieldConfig => {
        this.setupConditionalField(fieldConfig);
      });
    }

    // Process data-attribute based rules
    this.setupDataAttributeRules();
  }

  private setupConditionalField(config: ConditionalFieldConfig): void {
    const targetField = document.getElementById(config.targetFieldId);
    if (!targetField) {
      console.warn(`Target field ${config.targetFieldId} not found`);
      return;
    }

    // Set initial visibility based on default state
    // if (config.defaultState) {
    //   const isVisible = config.defaultState === 'visible';
    //   targetField.style.display = isVisible ? '' : 'none';
    // }

    // Add conditional rule
    this.conditionalManager.addRule({
      targetFieldId: config.targetFieldId,
      conditions: config.conditions,
      action: config.action,
      operator: config.operator,
      onStateChange: (isVisible: boolean) => {
        if (!isVisible && config.clearOnHide) {
          const field = document.getElementById(config.targetFieldId);
          if (field) {
            // Only proceed if field exists
            this.clearFieldValue(config.targetFieldId);
          }
        }
        if (isVisible && config.validateOnShow) {
          const field = document.getElementById(config.targetFieldId);
          if (field) {
            // Only proceed if field exists
            this.validateField(field);
          }
        }
      },
    });
  }

  private setupDataAttributeRules(): void {
    const conditionalFields = this.form.querySelectorAll('[data-conditional]');

    conditionalFields.forEach(field => {
      const rulesAttr = field.getAttribute('data-conditional');
      if (!rulesAttr) return;

      try {
        const config = JSON.parse(rulesAttr) as ConditionalFieldConfig;
        this.setupConditionalField(config);
      } catch (error) {
        console.error(
          `Invalid conditional rules for field ${field.id}:`,
          error,
        );
      }
    });
  }

  private clearFieldValue(fieldId: string): void {
    const field = document.getElementById(fieldId) as
      | HTMLInputElement
      | HTMLSelectElement;
    if (!field) return;

    // Clear field value
    field.value = '';

    // Update state manager
    this.stateManager.setFieldValue(fieldId, '');

    // Clear validation state
    this.validator.clearValidationState();
  }
}
