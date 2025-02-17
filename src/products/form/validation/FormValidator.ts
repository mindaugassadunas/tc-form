import JustValidate, { Rules, FieldRuleInterface } from 'just-validate';
import { FormStateManager } from '../managers/FormStateManager';
import { ValidationRulesBuilder } from './ValidationRulesBuilder';

export class FormValidator {
  private validator: JustValidate;
  private customValidations: Map<string, Rules[]>;
  private invalidFields: Set<string> = new Set();
  private stateManager?: FormStateManager;

  constructor(
    formSelector: string,
    options: object = {},
    stateManager?: FormStateManager,
  ) {
    this.validator = new JustValidate(formSelector, {
      validateBeforeSubmitting: false,
      focusInvalidField: true,
      errorFieldCssClass: ['error'],
      errorLabelStyle: {
        display: 'block',
      },
      errorLabelCssClass: ['error-message'],
      successLabelCssClass: ['success'],
      ...options,
    });

    this.customValidations = new Map();
    this.stateManager = stateManager;

    // Add callback to update state manager on validation
    if (this.stateManager) {
      this.validator.onValidate(async ({ fields }) => {
        Object.entries(fields).forEach(([fieldId, validation]) => {
          // Ensure isValid always has a boolean value
          const isValid = validation.isValid ?? false;
          const errors =
            (validation as any)?.errors?.map(
              (error: { message: string }) => error.message,
            ) || [];

          // Update state manager with validation results
          this.stateManager?.setFieldValidation(
            fieldId.replace('#', ''),
            isValid,
            errors,
          );
        });
      });
    }
  }

  public init(form: HTMLFormElement): void {
    const allFields = form.querySelectorAll('input, select, textarea');

    allFields.forEach(field => {
      if (!field.id) {
        console.warn('Field missing ID attribute:', field);
        return;
      }

      let allRules: FieldRuleInterface[] = [];

      // Get automatic rules
      allRules = allRules.concat(
        ValidationRulesBuilder.buildAutomaticRules(field as HTMLInputElement),
      );

      // Get custom rules
      if (field.hasAttribute('data-validate')) {
        const customRules = ValidationRulesBuilder.parseCustomRules(field);
        allRules = allRules.concat(customRules);
      }

      // Add field to validator if it has rules
      if (allRules.length > 0) {
        // Find error container for this field
        const errorContainer = document.querySelector(
          `[data-error="${field.id}"]`,
        );

        this.validator.addField(`#${field.id}`, allRules, {
          errorsContainer: errorContainer || undefined,
        });
      }
    });

    this.addCustomValidations();
  }

  public async validateFields(fields: Element[]): Promise<boolean> {
    try {
      // Filter out invalid fields first
      const validFields = fields.filter(field => {
        if (!(field instanceof HTMLElement) || !field.id) {
          console.warn('Invalid field element:', field);
          return false;
        }
        if (!document.querySelector(`#${field.id}`)) {
          console.warn(`Field not found with selector: #${field.id}`);
          return false;
        }
        return true;
      });

      if (validFields.length === 0) {
        console.warn('No valid fields to validate');
        return false;
      }

      // Execute validation for each field and collect results
      const validationPromises = validFields.map(field =>
        this.executeFieldValidation(field),
      );

      // Wait for all validations to complete
      const results = await Promise.all(validationPromises);

      // Log validation results for debugging
      validFields.forEach((field, index) => {
        if (field instanceof HTMLElement) {
          console.log(`Field ${field.id} validation result:`, results[index]);
        }
      });

      return results.every(result => result);
    } catch (error) {
      console.error('Error validating fields:', error);
      return false;
    }
  }

  public async executeFieldValidation(field: Element): Promise<boolean> {
    const fieldId = field instanceof HTMLElement ? field.id : null;
    if (!fieldId) {
      console.warn('Field missing ID attribute:', field);
      return false;
    }

    const selector = `#${fieldId}`;
    const element = document.querySelector(selector);
    if (!document.querySelector(selector)) {
      console.warn(`Field not found with selector: ${selector}`);
      return false;
    }

    // Check if it's a phone field
    // Handle phone fields separately
    // if (element instanceof HTMLInputElement && element.type === 'tel') {
    //   const isValid = await this.validatePhoneField(element);
    //   // Update validation state
    //   if (isValid) {
    //     this.invalidFields.delete(fieldId);
    //     element.classList.remove('error');
    //     element.classList.add('success');
    //   } else {
    //     this.invalidFields.add(fieldId);
    //     element.classList.remove('success');
    //     element.classList.add('error');
    //   }

    //   // Update error message display
    //   const errorElement = document.querySelector(`[data-error="${fieldId}"]`);
    //   if (errorElement) {
    //     errorElement.classList.toggle('visible', !isValid);
    //   }

    //   return isValid;
    // }

    const isValid = await this.validator.revalidateField(selector);

    if (isValid) {
      this.invalidFields.delete(fieldId);
    } else {
      this.invalidFields.add(fieldId);
    }

    return isValid;
  }

  private async validatePhoneField(
    element: HTMLInputElement,
  ): Promise<boolean> {
    // Get intl-tel-input instance from the element
    console.log(element);
    const iti = (element as any).iti;
    console.log(iti);
    console.log(iti.isValidNumber());
    if (!iti) {
      console.warn('intl-tel-input not initd for field:', element);
      return false;
    }

    return iti.isValidNumber();
  }

  public isFieldInvalid(fieldId: string): boolean {
    return this.invalidFields.has(fieldId);
  }

  public clearValidationState(): void {
    this.invalidFields.clear();

    // Clear validation state in state manager
    if (this.stateManager) {
      const state = this.stateManager.getState();
      Object.keys(state.fields).forEach(fieldId => {
        this.stateManager?.setFieldValidation(fieldId, true, []);
      });
    }
  }

  public async validateAll(): Promise<boolean> {
    const isValid = await this.validator.validate();

    // Update form-level validity in state manager
    this.stateManager?.updateState({
      isValid,
    });

    return isValid;
  }

  public addCustomValidation(
    fieldId: string,
    rules: Rules[],
    errorMessages?: Record<string, string>,
  ): void {
    this.customValidations.set(fieldId, rules);

    // Add field to validator with custom rules
    this.validator.addField(
      `#${fieldId}`,
      rules.map(rule => ({
        rule,
        errorMessage: errorMessages?.[rule] || this.getDefaultMessage(rule),
      })),
    );
  }

  public async revalidateField(fieldId: string): Promise<boolean> {
    const isValid = await this.validator.revalidateField(`#${fieldId}`);

    // Update state manager with field validation result
    this.stateManager?.setFieldValidation(fieldId, isValid);

    return isValid;
  }

  private getDefaultMessage(rule: string): string {
    const messages: Record<string, string> = {
      required: 'This field is required',
      email: 'Please enter a valid email',
      number: 'Please enter a valid number',
      minLength: 'Field is too short',
      maxLength: 'Field is too long',
      customRegexp: 'Invalid format',
      minNumber: 'Value is too small',
      maxNumber: 'Value is too large',
    };
    return messages[rule] || 'Invalid value';
  }

  private addCustomValidations(): void {
    this.customValidations.forEach((rules, fieldId) => {
      this.validator.addField(
        `#${fieldId}`,
        rules.map(rule => ({
          rule,
          errorMessage: this.getDefaultMessage(rule),
        })),
      );
    });
  }
}
