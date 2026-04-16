import type React from "react";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Text, useTheme } from "react-native-paper";

interface LoadingSpinnerProps {
  message?: string;
  size?: "small" | "large";
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  message,
  size = "large",
}) => {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <ActivityIndicator size={size} color={theme.colors.primary} />
      {message && (
        <Text
          style={[
            styles.message,
            { color: theme.colors.textSecondary, marginTop: theme.spacing.md },
          ]}
        >
          {message}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  message: {
    fontSize: 14,
  },
});

export default LoadingSpinner;
