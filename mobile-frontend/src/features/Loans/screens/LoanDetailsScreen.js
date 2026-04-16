// Removed unused MaterialCommunityIcons import
import PropTypes from "prop-types";
import { useEffect, useState } from "react";
// Import TextInput from react-native
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import {
  Button,
  Card,
  Divider,
  List,
  Text,
  useTheme,
} from "react-native-paper";
import { useWallet } from "../../../contexts/WalletContext"; // To check connection status
import { getLoanDetails } from "../../../services/apiService";

// Placeholder function for fallback
const placeholderLoans = [
  {
    id: "1",
    amount: 1500,
    interestRate: 8.5,
    term: 12,
    purpose: "Debt Consolidation",
    creditScoreRange: "650-700",
    status: "Available",
    borrower: "0x123...abc",
    description:
      "Looking to consolidate high-interest credit card debt into a single, manageable loan.",
    collateral: "None",
    fundedAmount: 0,
  },
  {
    id: "2",
    amount: 500,
    interestRate: 12.0,
    term: 6,
    purpose: "Small Business",
    creditScoreRange: "600-650",
    status: "Available",
    borrower: "0x456...def",
    description:
      "Need short-term funding for inventory purchase for my online store.",
    collateral: "None",
    fundedAmount: 100,
  },
  {
    id: "3",
    amount: 3000,
    interestRate: 7.0,
    term: 24,
    purpose: "Home Improvement",
    creditScoreRange: "700+",
    status: "Available",
    borrower: "0x789...ghi",
    description:
      "Funding needed for kitchen renovation project. Stable income and good credit history.",
    collateral: "None",
    fundedAmount: 0,
  },
  {
    id: "4",
    amount: 1000,
    interestRate: 9.0,
    term: 9,
    purpose: "Education",
    creditScoreRange: "680-720",
    status: "Funded",
    borrower: "0xabc...123",
    description: "Loan to cover costs for a professional certification course.",
    collateral: "None",
    fundedAmount: 1000,
  },
];

// Get loan details by ID
const getLoanDetailsById = async (loanId) => {
  console.log("Fetching details for loan:", loanId);
  try {
    const response = await getLoanDetails(loanId);
    return response.data;
  } catch (error) {
    console.error("Failed to fetch loan details:", error);
    // Fallback to placeholder data
    const loan = placeholderLoans.find((l) => l.id === loanId);
    if (!loan) {
      throw new Error("Loan not found");
    }
    return loan;
  }
};

const LoanDetailsScreen = ({ route, navigation }) => {
  const { loanId } = route.params;
  const theme = useTheme();
  const styles = createStyles(theme);
  const { isConnected, address, connectWallet } = useWallet(); // Get wallet context

  const [loan, setLoan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fundingAmount, setFundingAmount] = useState(""); // For funding input
  const [isFunding, setIsFunding] = useState(false);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        setLoading(true);
        setError(null);
        const loanDetails = await getLoanDetailsById(loanId);
        setLoan(loanDetails);
      } catch (err) {
        setError(err.message || "Failed to load loan details.");
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [loanId]);

  const handleFundLoan = async () => {
    if (!isConnected) {
      Alert.alert(
        "Connect Wallet",
        "Please connect your wallet to fund a loan.",
        [{ text: "Cancel" }, { text: "Connect", onPress: connectWallet }],
      );
      return;
    }

    // Basic validation
    const amountToFund = parseFloat(fundingAmount);
    if (Number.isNaN(amountToFund) || amountToFund <= 0) {
      Alert.alert(
        "Invalid Amount",
        "Please enter a valid positive amount to fund.",
      );
      return;
    }
    if (amountToFund > loan.amount - (loan.fundedAmount || 0)) {
      Alert.alert(
        "Invalid Amount",
        `You can fund a maximum of $${(loan.amount - (loan.fundedAmount || 0)).toFixed(2)}.`,
      );
      return;
    }

    setIsFunding(true);
    try {
      // TODO: Implement actual blockchain transaction using blockchainService
      console.log(
        `Funding loan ${loanId} with $${amountToFund} from address ${address}`,
      );
      // Example: await blockchainService.fundLoan(loanId, amountToFund);
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Simulate transaction

      Alert.alert(
        "Funding Successful",
        `You have successfully funded $${amountToFund} for loan ${loanId}.`,
      );
      // Optionally navigate back or refresh data
      navigation.goBack();
    } catch (err) {
      console.error("Funding failed:", err);
      Alert.alert(
        "Funding Failed",
        err.message || "An error occurred while funding the loan.",
      );
    } finally {
      setIsFunding(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (error || !loan) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>
          {error || "Loan details not available."}
        </Text>
      </View>
    );
  }

  const remainingAmount = loan.amount - (loan.fundedAmount || 0);
  const isFundable = loan.status === "Available" && remainingAmount > 0;

  return (
    <ScrollView style={styles.container}>
      <Card style={styles.card}>
        <Card.Title
          title={`Loan Request: $${loan.amount}`}
          subtitle={`Purpose: ${loan.purpose}`}
          titleStyle={styles.cardTitle}
          subtitleStyle={styles.cardSubtitle}
        />
        <Card.Content>
          <List.Item
            title="Interest Rate"
            description={`${loan.interestRate}% APR`}
            left={() => (
              <List.Icon icon="percent-outline" color={theme.colors.primary} />
            )}
          />
          <List.Item
            title="Term"
            description={`${loan.term} Months`}
            left={() => (
              <List.Icon
                icon="calendar-clock-outline"
                color={theme.colors.primary}
              />
            )}
          />
          <List.Item
            title="Credit Score Range"
            description={loan.creditScoreRange}
            left={() => (
              <List.Icon
                icon="credit-card-scan-outline"
                color={theme.colors.primary}
              />
            )}
          />
          <List.Item
            title="Borrower"
            description={`${loan.borrower.substring(0, 6)}...${loan.borrower.substring(loan.borrower.length - 4)}`}
            descriptionStyle={styles.addressText}
            left={() => (
              <List.Icon icon="account-outline" color={theme.colors.primary} />
            )}
            // Optional: Add onPress to view borrower profile or copy address
          />
          <Divider style={styles.divider} />
          <Text style={styles.descriptionTitle}>Description</Text>
          <Text style={styles.descriptionText}>{loan.description}</Text>
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.cardTitle}>Funding Status</Text>
          <List.Item
            title="Status"
            description={loan.status}
            left={() => (
              <List.Icon
                icon={
                  loan.status === "Available"
                    ? "check-circle-outline"
                    : "information-outline"
                }
                color={
                  loan.status === "Available"
                    ? theme.colors.success
                    : theme.colors.disabled
                }
              />
            )}
          />
          <List.Item
            title="Amount Funded"
            description={`$${(loan.fundedAmount || 0).toLocaleString()} / $${loan.amount.toLocaleString()}`}
            left={() => (
              <List.Icon icon="cash-multiple" color={theme.colors.primary} />
            )}
          />
          {isFundable && (
            <View style={styles.fundingSection}>
              <Divider style={styles.divider} />
              <Text style={styles.fundingTitle}>Fund This Loan</Text>
              {/* Use TextInput from react-native */}
              <View style={styles.inputContainer}>
                <Text style={styles.dollarSign}>$</Text>
                <TextInput
                  style={styles.fundingInput}
                  keyboardType="numeric"
                  placeholder={`Enter amount (max $${remainingAmount.toFixed(2)})`}
                  value={fundingAmount}
                  onChangeText={setFundingAmount}
                  placeholderTextColor={theme.colors.placeholder}
                />
              </View>
              <Button
                mode="contained"
                onPress={handleFundLoan}
                style={styles.fundButton}
                disabled={isFunding || !isConnected}
                loading={isFunding}
                icon="cash-plus"
              >
                {isConnected ? "Fund Now" : "Connect Wallet to Fund"}
              </Button>
              {!isConnected && (
                <Text style={styles.connectPrompt}>
                  You need to connect your wallet first.
                </Text>
              )}
            </View>
          )}
        </Card.Content>
      </Card>
    </ScrollView>
  );
};

LoanDetailsScreen.propTypes = {
  route: PropTypes.shape({
    params: PropTypes.shape({
      loanId: PropTypes.string.isRequired,
    }).isRequired,
  }).isRequired,
  navigation: PropTypes.shape({
    goBack: PropTypes.func.isRequired,
  }).isRequired,
};

const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: theme.colors.background,
    },
    errorContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: theme.spacing.lg,
    },
    errorText: {
      color: theme.colors.error,
      fontSize: theme.fontSizes.body1,
      textAlign: "center",
    },
    card: {
      margin: theme.spacing.lg,
      marginTop: theme.spacing.md,
      borderRadius: theme.borderRadius.lg,
      backgroundColor: theme.colors.surface,
      elevation: 3,
    },
    cardTitle: {
      fontSize: theme.fontSizes.h4,
      fontFamily: theme.fonts.primaryBold,
      color: theme.colors.primary,
    },
    cardSubtitle: {
      fontSize: theme.fontSizes.body1,
      fontFamily: theme.fonts.primary,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.sm,
    },
    divider: {
      marginVertical: theme.spacing.md,
      backgroundColor: theme.colors.border,
    },
    descriptionTitle: {
      fontSize: theme.fontSizes.h6,
      fontFamily: theme.fonts.primarySemiBold,
      color: theme.colors.textPrimary,
      marginBottom: theme.spacing.sm,
    },
    descriptionText: {
      fontSize: theme.fontSizes.body1,
      fontFamily: theme.fonts.primary,
      color: theme.colors.textSecondary,
      lineHeight: theme.fontSizes.body1 * 1.5,
    },
    addressText: {
      fontFamily: "monospace", // Use monospace for addresses
      fontSize: theme.fontSizes.caption,
    },
    fundingSection: {
      marginTop: theme.spacing.md,
    },
    fundingTitle: {
      fontSize: theme.fontSizes.h5,
      fontFamily: theme.fonts.primarySemiBold,
      color: theme.colors.primary,
      marginBottom: theme.spacing.md,
      textAlign: "center",
    },
    inputContainer: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.md,
      paddingHorizontal: theme.spacing.md,
      marginBottom: theme.spacing.md,
      backgroundColor: theme.colors.background, // Match background or surface
    },
    dollarSign: {
      fontSize: theme.fontSizes.h5,
      color: theme.colors.textSecondary,
      marginRight: theme.spacing.sm,
    },
    fundingInput: {
      flex: 1,
      fontSize: theme.fontSizes.h5,
      paddingVertical: theme.spacing.md, // Adjust padding
      color: theme.colors.textPrimary,
      // Using basic RN TextInput here, consider Paper's TextInput if more features needed
    },
    fundButton: {
      borderRadius: theme.borderRadius.lg,
      paddingVertical: theme.spacing.xs,
    },
    connectPrompt: {
      textAlign: "center",
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.sm,
      fontSize: theme.fontSizes.caption,
    },
  });

export default LoanDetailsScreen;
