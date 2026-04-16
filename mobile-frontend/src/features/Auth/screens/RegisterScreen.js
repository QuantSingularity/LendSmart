import { Formik } from "formik";
import PropTypes from "prop-types";
import { useContext, useState } from "react";
import {
  Alert,
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

const RegisterSchema = Yup.object().shape({
  name: Yup.string().required("Name is required"),
  email: Yup.string().email("Invalid email").required("Email is required"),
  password: Yup.string()
    .min(8, "Password must be at least 8 characters")
    .matches(/[a-z]/, "Password must contain at least one lowercase letter")
    .matches(/[A-Z]/, "Password must contain at least one uppercase letter")
    .matches(/[0-9]/, "Password must contain at least one number")
    .required("Password is required"),
  confirmPassword: Yup.string()
    .oneOf([Yup.ref("password"), null], "Passwords must match")
    .required("Confirm password is required"),
});

const RegisterScreen = ({ navigation }) => {
  const { register, loading, error: authError } = useContext(AuthContext);
  const theme = useTheme();
  const styles = createStyles(theme);
  const [serverError, setServerError] = useState(null);

  const handleRegister = async (values, { setSubmitting, resetForm }) => {
    try {
      setServerError(null);
      // eslint-disable-next-line no-unused-vars
      const { confirmPassword, ...userData } = values;
      await register(userData);
      // Show success message and navigate to login
      Alert.alert(
        "Registration Successful",
        "You can now log in with your credentials.",
        [
          {
            text: "OK",
            onPress: () => {
              resetForm();
              navigation.navigate("Login");
            },
          },
        ],
      );
    } catch (err) {
      setServerError(err.message || "Registration failed. Please try again.");
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
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join LendSmart today!</Text>

          <Formik
            initialValues={{
              name: "",
              email: "",
              password: "",
              confirmPassword: "",
            }}
            validationSchema={RegisterSchema}
            onSubmit={handleRegister}
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
                  label="Full Name"
                  value={values.name}
                  onChangeText={handleChange("name")}
                  onBlur={handleBlur("name")}
                  style={styles.input}
                  mode="outlined" // Modern outlined style
                  error={touched.name && !!errors.name}
                  left={<TextInput.Icon icon="account-outline" />} // Add icon
                />
                {touched.name && errors.name && (
                  <Text style={styles.errorText}>{errors.name}</Text>
                )}

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

                <TextInput
                  label="Confirm Password"
                  value={values.confirmPassword}
                  onChangeText={handleChange("confirmPassword")}
                  onBlur={handleBlur("confirmPassword")}
                  secureTextEntry
                  style={styles.input}
                  mode="outlined" // Modern outlined style
                  error={touched.confirmPassword && !!errors.confirmPassword}
                  left={<TextInput.Icon icon="lock-check-outline" />} // Add icon
                />
                {touched.confirmPassword && errors.confirmPassword && (
                  <Text style={styles.errorText}>{errors.confirmPassword}</Text>
                )}

                {(authError || serverError) && (
                  <Text style={styles.serverErrorText}>
                    {authError || serverError}
                  </Text>
                )}

                <Button
                  mode="contained"
                  onPress={handleSubmit}
                  style={styles.button}
                  contentStyle={styles.buttonContent}
                  labelStyle={styles.buttonLabel}
                  disabled={isSubmitting || loading}
                  loading={loading}
                  icon="account-plus-outline" // Add icon
                >
                  Register
                </Button>

                <Button
                  mode="text"
                  onPress={() => navigation.navigate("Login")}
                  style={styles.switchButton}
                  disabled={isSubmitting || loading}
                  labelStyle={styles.switchButtonLabel}
                >
                  Already have an account? Login
                </Button>
              </View>
            )}
          </Formik>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

RegisterScreen.propTypes = {
  navigation: PropTypes.shape({
    navigate: PropTypes.func.isRequired,
  }).isRequired,
};

// Updated createStyles function using the modernized theme
const createStyles = (theme) =>
  StyleSheet.create({
    keyboardAvoidingView: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollContainer: {
      flexGrow: 1,
      justifyContent: "center",
    },
    container: {
      flex: 1,
      justifyContent: "center",
      padding: theme.spacing.xl,
      backgroundColor: theme.colors.background,
    },
    title: {
      fontSize: theme.fontSizes.h1,
      fontFamily: theme.fonts.primaryBold,
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
    },
    button: {
      marginTop: theme.spacing.lg,
      borderRadius: theme.borderRadius.lg,
      elevation: 2,
    },
    buttonContent: {
      paddingVertical: theme.spacing.sm,
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
    errorText: {
      color: theme.colors.error,
      fontSize: theme.fontSizes.caption,
      marginBottom: theme.spacing.md,
      marginLeft: theme.spacing.xs,
      marginTop: -theme.spacing.sm,
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

export default RegisterScreen;
