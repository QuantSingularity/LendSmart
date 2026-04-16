import type React from "react";
import { StyleSheet, View } from "react-native";
import { Button, Text, useTheme } from "react-native-paper";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
  icon?: string;
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({
  message,
  onRetry,
  icon = "alert-circle-outline",
}) => {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <MaterialCommunityIcons
        name={icon}
        size={48}
        color={theme.colors.error}
      />
      <Text
        style={[
          styles.message,
          {
            color: theme.colors.error,
            marginTop: theme.spacing.md,
            fontFamily: theme.fonts.primaryMedium,
          },
        ]}
      >
        {message}
      </Text>
      {onRetry && (
        <Button
          mode="contained"
          onPress={onRetry}
          style={{ marginTop: theme.spacing.lg }}
          icon="refresh"
        >
          Try Again
        </Button>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  message: {
    fontSize: 16,
    textAlign: "center",
  },
});

export default ErrorMessage;
