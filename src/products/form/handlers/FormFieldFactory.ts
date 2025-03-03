import { createDatepicker } from '../components/datepicker/initDatepicker';
import { Datepicker } from '../components/datepicker/Datepicker';
import { DatepickerConfig } from '../components/datepicker/types/datepickerTypes';
import { BaseDropdown } from '../components/dropdown/BaseDropdown';
import { createDropdown } from '../components/dropdown/dropdown';
import { createPhoneField } from '../components/phone/phone';
import { PhoneField } from '../components/phone/PhoneField';
import { PhoneFieldConfig } from '../components/phone/types/phoneTypes';
import { createSelect } from '../components/select/select';
import { SelectTabs } from '../components/select/SelectTabs';
import { BaseField, BaseFieldConfig } from '../models/formTypes';
import { createURLField } from '../components/url/url';
import { URLFieldConfig } from '../components/url/types/urlTypes';
import { URLField } from '../components/url/URLField';
import { createFileUpload } from '../components/file/FileUpload';
import { FileUploadConfig } from '../components/file/types/fileTypes';
import { FileUpload } from '../components/file/FileUploadField';

export class FormFieldFactory {
  private static fieldMap: Map<string, BaseField> = new Map();

  static createField(
    element: HTMLElement,
    config: BaseFieldConfig,
  ):
    | BaseDropdown
    | Datepicker
    | SelectTabs
    | PhoneField
    | URLField
    | FileUpload
    | null {
    const fieldId = element.id;
    if (!fieldId) {
      console.warn('Field element missing ID', element);
      return null;
    }

    let field:
      | BaseDropdown
      | Datepicker
      | SelectTabs
      | PhoneField
      | URLField
      | FileUpload
      | null = null;

    switch (config.type) {
      case 'dropdown':
        console.log('ITS DROPDOWN');
        field = createDropdown(element, config);
        break;
      case 'datepicker':
        field = createDatepicker(element, config as DatepickerConfig);
        break;
      case 'select':
        field = createSelect(element);
        break;
      case 'phone':
        if (config.type === 'phone') {
          field = createPhoneField(element, config as PhoneFieldConfig);
        }
        break;
      case 'url':
        field = createURLField(element, config as URLFieldConfig);
        break;
      case 'fileupload':
        field = createFileUpload(element, config as FileUploadConfig);
        break;
      default:
        console.warn(`Unsupported field type: ${config.type}`);
        return null;
    }

    if (field) {
      this.fieldMap.set(fieldId, field);
    }

    return field;
  }

  static getField(fieldId: string): BaseField | undefined {
    return this.fieldMap.get(fieldId);
  }

  //   static destroyField(fieldId: string): void {
  //     const field = this.fieldMap.get(fieldId);
  //     if (field) {
  //       field.destroy();
  //       this.fieldMap.delete(fieldId);
  //     }
  //   }
}
