import type React from "react";
import { StyleSheet, type TextStyle, type ViewStyle } from "react-native";
import { Button as PaperButton, useTheme } from "react-native-paper";

interface ButtonProps {
  mode?: "text" | "outlined" | "contained";
  onPress: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  labelStyle?: TextStyle;
  uppercase?: boolean;
  compact?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  mode = "contained",
  onPress,
  children,
  disabled = false,
  loading = false,
  icon,
  style,
  contentStyle,
  labelStyle,
  uppercase = false,
  compact = false,
}) => {
  const theme = useTheme();

  return (
    <PaperButton
      mode={mode}
      onPress={onPress}
      disabled={disabled}
      loading={loading}
      icon={icon}
      style={[styles.button, style]}
      contentStyle={[styles.content, contentStyle]}
      labelStyle={[{ fontFamily: theme.fonts.primarySemiBold }, labelStyle]}
      uppercase={uppercase}
      compact={compact}
    >
      {children}
    </PaperButton>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 8,
  },
  content: {
    paddingVertical: 6,
  },
});

export default Button;
