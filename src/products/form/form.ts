import { FormConfig } from './models/formTypes';
import { MultiStepForm } from './core/MultiStepForm';
import { SingleStepForm } from './core/SingleStepForm';
import { DateRangeMode } from './components/datepicker/types/datepickerTypes';

const formConfig: FormConfig = {
  path: window.location.pathname,
  action: 'https://hook.eu1.make.com/ykjl2vvn4s3m9nfnkqwc5fr3gv95xb6t',
  successRedirect: '/confirmation.html',
  redirectParams: [
    {
      key: 'course',
      value: 'DA',
    },
    {
      key: 'utm',
      fieldId: 'utm_source',
    },
  ],
  //   successMessage: 'Success',
  hiddenFields: [
    {
      name: 'utm_source',
      cookieKey: 'utm_source',
      storageKey: 'utm_source',
      defaultValue: '',
    },
  ],
  conditionalFields: [
    {
      targetFieldId: 'lastName',
      action: 'show',
      operator: 'AND',
      conditions: [
        {
          fieldId: 'firstName',
          operator: 'equals',
          value: 'a',
        },
      ],
      clearOnHide: true,
      validateOnShow: false,
    },
  ],
  fields: {
    country: {
      type: 'dropdown',
      options: [
        { value: 'us', label: 'United States' },
        { value: 'ca', label: 'Canada' },
      ],
      searchable: true,
      placeholder: 'Select a country',
    },
    datepicker: {
      type: 'datepicker',
      format: 'YYYY-MM-DD',
      allowInput: true,
      rangeMode: DateRangeMode.PAST,
      placeholder: 'Select date...',
      showTodayButton: false,
    },
    select1: {
      type: 'select',
    },
    select2: {
      type: 'select',
    },
    phoneInput: {
      type: 'phone',
    },
  },
};

function initForm(
  wrapper: HTMLElement,
  form: HTMLFormElement,
  formConfig: FormConfig,
) {
  const type = wrapper.getAttribute('fl-type');
  switch (type) {
    case 'multi-step':
      return new MultiStepForm(wrapper, form, formConfig);
    default:
      return new SingleStepForm(wrapper, form, formConfig);
  }
}

document.querySelectorAll('[fl="form"]').forEach(wrapper => {
  const form = wrapper.querySelector('form') as HTMLFormElement;
  initForm(wrapper as HTMLElement, form, formConfig);
});
