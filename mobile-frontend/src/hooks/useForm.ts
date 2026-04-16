import { useCallback, useState } from "react";

interface ValidationRules<T> {
  [key: string]: (value: any, values: T) => string | undefined;
}

interface UseFormOptions<T> {
  initialValues: T;
  validationRules?: ValidationRules<T>;
  onSubmit: (values: T) => void | Promise<void>;
}

interface UseFormReturn<T> {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  touched: Partial<Record<keyof T, boolean>>;
  isSubmitting: boolean;
  handleChange: (name: keyof T) => (value: any) => void;
  handleBlur: (name: keyof T) => () => void;
  handleSubmit: () => Promise<void>;
  setFieldValue: (name: keyof T, value: any) => void;
  setFieldError: (name: keyof T, error: string) => void;
  resetForm: () => void;
  validateField: (name: keyof T) => boolean;
  validateForm: () => boolean;
}

/**
 * Custom hook for form handling with validation
 * @param options Form options including initial values, validation rules, and submit handler
 * @returns Form state and handlers
 */
export const useForm = <T extends Record<string, any>>({
  initialValues,
  validationRules = {},
  onSubmit,
}: UseFormOptions<T>): UseFormReturn<T> => {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateField = useCallback(
    (name: keyof T): boolean => {
      if (validationRules[name as string]) {
        const error = validationRules[name as string](values[name], values);
        if (error) {
          setErrors((prev) => ({ ...prev, [name]: error }));
          return false;
        } else {
          setErrors((prev) => {
            const newErrors = { ...prev };
            delete newErrors[name];
            return newErrors;
          });
          return true;
        }
      }
      return true;
    },
    [values, validationRules],
  );

  const validateForm = useCallback((): boolean => {
    let isValid = true;
    const newErrors: Partial<Record<keyof T, string>> = {};

    Object.keys(validationRules).forEach((key) => {
      const error = validationRules[key](values[key as keyof T], values);
      if (error) {
        newErrors[key as keyof T] = error;
        isValid = false;
      }
    });

    setErrors(newErrors);
    return isValid;
  }, [values, validationRules]);

  const handleChange = useCallback(
    (name: keyof T) => {
      return (value: any) => {
        setValues((prev) => ({ ...prev, [name]: value }));

        // Clear error when user starts typing
        if (errors[name]) {
          setErrors((prev) => {
            const newErrors = { ...prev };
            delete newErrors[name];
            return newErrors;
          });
        }
      };
    },
    [errors],
  );

  const handleBlur = useCallback(
    (name: keyof T) => {
      return () => {
        setTouched((prev) => ({ ...prev, [name]: true }));
        validateField(name);
      };
    },
    [validateField],
  );

  const setFieldValue = useCallback((name: keyof T, value: any) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const setFieldError = useCallback((name: keyof T, error: string) => {
    setErrors((prev) => ({ ...prev, [name]: error }));
  }, []);

  const resetForm = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
    setIsSubmitting(false);
  }, [initialValues]);

  const handleSubmit = useCallback(async () => {
    // Mark all fields as touched
    const allTouched = Object.keys(initialValues).reduce(
      (acc, key) => {
        acc[key as keyof T] = true;
        return acc;
      },
      {} as Partial<Record<keyof T, boolean>>,
    );
    setTouched(allTouched);

    // Validate form
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } catch (error) {
      console.error("Form submission error:", error);
    } finally {
      setIsSubmitting(false);
    }
  }, [values, validateForm, onSubmit, initialValues]);

  return {
    values,
    errors,
    touched,
    isSubmitting,
    handleChange,
    handleBlur,
    handleSubmit,
    setFieldValue,
    setFieldError,
    resetForm,
    validateField,
    validateForm,
  };
};

export default useForm;
