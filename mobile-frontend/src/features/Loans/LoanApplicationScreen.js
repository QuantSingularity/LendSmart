import { Formik } from "formik";
import PropTypes from "prop-types"; // Import PropTypes
import { useContext, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
// Removed unused imports: ActivityIndicator, ProgressBar, MD3Colors
import { Button, Text, TextInput, useTheme } from "react-native-paper";
import * as Yup from "yup";
import { AuthContext } from "../../../contexts/AuthContext";
import apiService from "../../../services/apiService"; // Assuming API service is set up
import { spacing } from "../../../theme/theme";

const LoanApplicationSchema = Yup.object().shape({
  amount: Yup.number()
    .required("Loan amount is required")
    .positive("Amount must be positive")
    .min(100, "Minimum loan amount is $100") // Example minimum
    .max(10000, "Maximum loan amount is $10,000"), // Example maximum
  term: Yup.number()
    .required("Loan term is required")
    .integer("Term must be in whole months")
    .positive("Term must be positive")
    .min(1, "Minimum term is 1 month")
    .max(36, "Maximum term is 36 months"), // Example maximum
  purpose: Yup.string()
    .required("Loan purpose is required")
    .min(10, "Please provide a brief description (min 10 chars)")
    .max(200, "Purpose description is too long (max 200 chars)"),
  // Add more fields as needed (e.g., income details, collateral info)
});

const LoanApplicationScreen = ({ navigation }) => {
  const { user } = useContext(AuthContext);
  const theme = useTheme();
  const styles = createStyles(theme);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Removed unused state: step, setStep
  // Removed unused const: totalSteps

  const handleSubmitLoan = async (values, { setSubmitting, resetForm }) => {
    if (!user) {
      setError("You must be logged in to apply for a loan.");
      setSubmitting(false);
      return;
    }

    // Optional: Check wallet connection before proceeding
    // if (!blockchainService.isConnected()) {
    //   Alert.alert('Wallet Not Connected', 'Please connect your wallet before applying.');
    //   setSubmitting(false);
    //   return;
    // }

    setLoading(true);
    setError(null);
    try {
      // 1. Submit application details to backend API
      console.log("Submitting loan application to backend:", values);
      const apiResponse = await apiService.applyLoan({
        amount: values.amount,
        term: values.term,
        purpose: values.purpose,
        userId: user.id,
      });
      console.log("API Response:", apiResponse.data);

      if (!apiResponse.data?.id) {
        throw new Error(
          apiResponse.data?.message || "Failed to submit application via API.",
        );
      }

      // 2. Optional: Interact with blockchain (e.g., register application hash)
      // This might happen on the backend, or require a signature here.
      // For simplicity, we assume backend handles blockchain interaction or it's not needed at this stage.
      console.log(
        "Loan application submitted successfully. Loan ID:",
        apiResponse.data.id,
      );

      const _loanId = apiResponse.data.id;

      // Show success message and reset form
      Alert.alert(
        "Application Submitted",
        "Your loan application has been submitted successfully. You can track its status in your dashboard.",
        [
          {
            text: "OK",
            onPress: () => {
              resetForm();
              navigation.navigate("Dashboard");
            },
          },
        ],
      );
    } catch (err) {
      console.error("Loan application failed:", err);
      setError(
        err.message || "An error occurred while submitting your application.",
      );
    } finally {
      setLoading(false);
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Apply for a Loan</Text>
        <Text style={styles.subtitle}>
          Fill in the details below to submit your loan request.
        </Text>
      </View>

      {/* Progress Bar for multi-step form (kept for potential future use) */}
      {/* <ProgressBar progress={step / totalSteps} color={theme.colors.primary} style={styles.progressBar} /> */}

      <Formik
        initialValues={{ amount: "", term: "", purpose: "" }}
        validationSchema={LoanApplicationSchema}
        onSubmit={handleSubmitLoan}
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
              label="Loan Amount ($)"
              value={values.amount}
              onChangeText={handleChange("amount")}
              onBlur={handleBlur("amount")}
              keyboardType="numeric"
              style={styles.input}
              error={touched.amount && !!errors.amount}
            />
            {touched.amount && errors.amount && (
              <Text style={styles.errorText}>{errors.amount}</Text>
            )}

            <TextInput
              label="Loan Term (Months)"
              value={values.term}
              onChangeText={handleChange("term")}
              onBlur={handleBlur("term")}
              keyboardType="numeric"
              style={styles.input}
              error={touched.term && !!errors.term}
            />
            {touched.term && errors.term && (
              <Text style={styles.errorText}>{errors.term}</Text>
            )}

            <TextInput
              label="Purpose of Loan"
              value={values.purpose}
              onChangeText={handleChange("purpose")}
              onBlur={handleBlur("purpose")}
              multiline
              numberOfLines={3}
              style={[styles.input, styles.textArea]}
              error={touched.purpose && !!errors.purpose}
            />
            {touched.purpose && errors.purpose && (
              <Text style={styles.errorText}>{errors.purpose}</Text>
            )}

            {/* Add more form fields here based on requirements */}

            {error && <Text style={styles.serverErrorText}>{error}</Text>}

            <Button
              mode="contained"
              onPress={handleSubmit}
              style={styles.button}
              disabled={isSubmitting || loading}
              loading={isSubmitting || loading}
            >
              Submit Application
            </Button>
          </View>
        )}
      </Formik>
    </ScrollView>
  );
};

// Add prop types validation
LoanApplicationScreen.propTypes = {
  navigation: PropTypes.shape({
    navigate: PropTypes.func.isRequired,
  }).isRequired,
};

const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      padding: spacing.md,
      paddingBottom: spacing.sm,
    },
    title: {
      fontSize: theme.fontSizes.h4,
      fontWeight: "bold",
      color: theme.colors.primary,
      marginBottom: spacing.xs,
    },
    subtitle: {
      fontSize: theme.fontSizes.body1,
      color: theme.colors.textSecondary,
    },
    progressBar: {
      marginHorizontal: spacing.md,
      marginBottom: spacing.md,
    },
    formContainer: {
      padding: spacing.md,
    },
    input: {
      marginBottom: spacing.sm,
      backgroundColor: theme.colors.surface,
    },
    textArea: {
      height: 100, // Adjust height for multiline input
      textAlignVertical: "top",
    },
    button: {
      marginTop: spacing.lg,
      paddingVertical: spacing.xs,
    },
    errorText: {
      color: theme.colors.error,
      fontSize: theme.fontSizes.caption,
      marginBottom: spacing.sm,
      marginLeft: spacing.xs,
    },
    serverErrorText: {
      color: theme.colors.error,
      fontSize: theme.fontSizes.body2,
      textAlign: "center",
      marginTop: spacing.sm,
      marginBottom: spacing.sm,
    },
  });

export default LoanApplicationScreen;
