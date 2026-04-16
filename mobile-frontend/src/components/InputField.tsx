import type React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { Text, TextInput, useTheme } from "react-native-paper";

interface InputFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  error?: string;
  touched?: boolean;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "numeric" | "phone-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  multiline?: boolean;
  numberOfLines?: number;
  icon?: string;
  rightIcon?: string;
  disabled?: boolean;
  style?: ViewStyle;
  mode?: "flat" | "outlined";
}

const InputField: React.FC<InputFieldProps> = ({
  label,
  value,
  onChangeText,
  onBlur,
  placeholder,
  error,
  touched,
  secureTextEntry = false,
  keyboardType = "default",
  autoCapitalize = "sentences",
  multiline = false,
  numberOfLines = 1,
  icon,
  rightIcon,
  disabled = false,
  style,
  mode = "outlined",
}) => {
  const theme = useTheme();
  const hasError = touched && !!error;

  return (
    <View style={[styles.container, style]}>
      <TextInput
        label={label}
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder={placeholder}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        numberOfLines={numberOfLines}
        disabled={disabled}
        mode={mode}
        error={hasError}
        left={icon ? <TextInput.Icon icon={icon} /> : undefined}
        right={rightIcon ? <TextInput.Icon icon={rightIcon} /> : undefined}
        style={styles.input}
      />
      {hasError && (
        <Text
          style={[
            styles.errorText,
            { color: theme.colors.error, fontSize: theme.fontSizes.caption },
          ]}
        >
          {error}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  input: {
    backgroundColor: "transparent",
  },
  errorText: {
    marginTop: 4,
    marginLeft: 12,
  },
});

export default InputField;
