import { Formik } from "formik";
import PropTypes from "prop-types";
import { useContext } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Button, Text, TextInput, useTheme } from "react-native-paper";
import * as Yup from "yup";
import { AuthContext } from "../../../contexts/AuthContext";

// Removed direct import of spacing, use theme.spacing instead

const LoginSchema = Yup.object().shape({
  email: Yup.string().email("Invalid email").required("Required"),
  password: Yup.string().min(6, "Password too short").required("Required"),
});

const LoginScreen = ({ navigation }) => {
  const { login, loading, error } = useContext(AuthContext);
  const theme = useTheme(); // Get the full theme object
  const styles = createStyles(theme); // Pass theme to style creator

  const handleLogin = async (values, { setSubmitting }) => {
    try {
      await login(values);
      // Navigation handled by AppNavigator
    } catch (err) {
      console.log("Login error caught in screen:", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.keyboardAvoidingView}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.container}>
          {/* Consider adding an App Logo here */}
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Login to your LendSmart account</Text>

          <Formik
            initialValues={{ email: "", password: "" }}
            validationSchema={LoginSchema}
            onSubmit={handleLogin}
          >
            {({
              handleChange,
              handleBlur,
              handleSubmit,
              values,
              errors,
              touched,
              isSubmitting,
            }) => (
              <View style={styles.formContainer}>
                <TextInput
                  label="Email"
                  value={values.email}
                  onChangeText={handleChange("email")}
                  onBlur={handleBlur("email")}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={styles.input}
                  mode="outlined" // Modern outlined style
                  error={touched.email && !!errors.email}
                  left={<TextInput.Icon icon="email-outline" />} // Add icon
                />
                {touched.email && errors.email && (
                  <Text style={styles.errorText}>{errors.email}</Text>
                )}

                <TextInput
                  label="Password"
                  value={values.password}
                  onChangeText={handleChange("password")}
                  onBlur={handleBlur("password")}
                  secureTextEntry
                  style={styles.input}
                  mode="outlined" // Modern outlined style
                  error={touched.password && !!errors.password}
                  left={<TextInput.Icon icon="lock-outline" />} // Add icon
                />
                {touched.password && errors.password && (
                  <Text style={styles.errorText}>{errors.password}</Text>
                )}

                {/* Optional: Forgot Password Link */}
                {/* <Button mode="text" onPress={() => {}} style={styles.forgotPasswordButton}>Forgot Password?</Button> */}

                {error && <Text style={styles.serverErrorText}>{error}</Text>}

                <Button
                  mode="contained"
                  onPress={handleSubmit}
                  style={styles.button}
                  contentStyle={styles.buttonContent} // Control inner padding
                  labelStyle={styles.buttonLabel} // Control text style
                  disabled={isSubmitting || loading}
                  loading={loading} // Use loading prop directly
                  icon="login-variant" // Add icon
                >
                  Login
                </Button>

                <Button
                  mode="text"
                  onPress={() => navigation.navigate("Register")}
                  style={styles.switchButton}
                  disabled={isSubmitting || loading}
                  labelStyle={styles.switchButtonLabel}
                >
                  Don't have an account? Register
                </Button>
              </View>
            )}
          </Formik>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

LoginScreen.propTypes = {
  navigation: PropTypes.shape({
    navigate: PropTypes.func.isRequired,
  }).isRequired,
};

// Updated createStyles function using the modernized theme
const createStyles = (theme) =>
  StyleSheet.create({
    keyboardAvoidingView: {
      flex: 1,
      backgroundColor: theme.colors.background, // Use theme background
    },
    scrollContainer: {
      flexGrow: 1,
      justifyContent: "center",
    },
    container: {
      flex: 1,
      justifyContent: "center",
      padding: theme.spacing.xl, // Use theme spacing
      backgroundColor: theme.colors.background,
    },
    title: {
      fontSize: theme.fontSizes.h1, // Use theme font sizes
      fontFamily: theme.fonts.primaryBold, // Use theme fonts
      color: theme.colors.primary,
      textAlign: "center",
      marginBottom: theme.spacing.sm,
    },
    subtitle: {
      fontSize: theme.fontSizes.body1,
      fontFamily: theme.fonts.primary,
      color: theme.colors.textSecondary,
      textAlign: "center",
      marginBottom: theme.spacing.xl,
    },
    formContainer: {
      width: "100%",
    },
    input: {
      marginBottom: theme.spacing.md,
      // Outlined inputs don't need explicit background color usually
    },
    button: {
      marginTop: theme.spacing.lg,
      borderRadius: theme.borderRadius.lg, // Use theme border radius
      elevation: 2, // Subtle shadow
    },
    buttonContent: {
      paddingVertical: theme.spacing.sm, // Adjust padding
    },
    buttonLabel: {
      fontFamily: theme.fonts.primarySemiBold,
      fontSize: theme.fontSizes.h6,
    },
    switchButton: {
      marginTop: theme.spacing.md,
    },
    switchButtonLabel: {
      fontFamily: theme.fonts.primaryMedium,
      fontSize: theme.fontSizes.body2,
    },
    forgotPasswordButton: {
      alignSelf: "flex-end",
      marginTop: -theme.spacing.sm, // Adjust position
      marginBottom: theme.spacing.md,
    },
    errorText: {
      color: theme.colors.error,
      fontSize: theme.fontSizes.caption,
      marginBottom: theme.spacing.md, // Add margin below error
      marginLeft: theme.spacing.xs,
      marginTop: -theme.spacing.sm, // Reduce space above error
    },
    serverErrorText: {
      color: theme.colors.error,
      fontSize: theme.fontSizes.body2,
      fontFamily: theme.fonts.primaryMedium,
      textAlign: "center",
      marginTop: theme.spacing.sm,
      marginBottom: theme.spacing.md,
    },
  });

export default LoginScreen;
