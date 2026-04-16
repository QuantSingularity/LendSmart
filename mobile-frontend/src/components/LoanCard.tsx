import type React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Chip, Text, useTheme } from "react-native-paper";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import Card from "./Card";

interface Loan {
  id: string;
  amount: number;
  interestRate: number;
  term: number;
  purpose: string;
  status?: string;
  borrowerName?: string;
  borrowerReputation?: number;
  riskCategory?: "low" | "medium" | "high";
  fundedAmount?: number;
  remainingAmount?: number;
}

interface LoanCardProps {
  loan: Loan;
  onPress: () => void;
}

const LoanCard: React.FC<LoanCardProps> = ({ loan, onPress }) => {
  const theme = useTheme();

  const getRiskColor = (risk?: string) => {
    switch (risk) {
      case "low":
        return theme.colors.success;
      case "medium":
        return theme.colors.warning;
      case "high":
        return theme.colors.error;
      default:
        return theme.colors.textSecondary;
    }
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const progress =
    loan.fundedAmount && loan.amount
      ? (loan.fundedAmount / loan.amount) * 100
      : 0;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card style={styles.card}>
        <View style={styles.cardContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text
              style={[
                styles.amount,
                {
                  color: theme.colors.primary,
                  fontFamily: theme.fonts.primaryBold,
                },
              ]}
            >
              {formatCurrency(loan.amount)}
            </Text>
            {loan.riskCategory && (
              <Chip
                mode="flat"
                style={[
                  styles.riskChip,
                  { backgroundColor: getRiskColor(loan.riskCategory) },
                ]}
                textStyle={styles.chipText}
              >
                {loan.riskCategory.toUpperCase()}
              </Chip>
            )}
          </View>

          {/* Purpose */}
          <Text
            style={[
              styles.purpose,
              {
                color: theme.colors.text,
                fontFamily: theme.fonts.primary,
              },
            ]}
            numberOfLines={2}
          >
            {loan.purpose}
          </Text>

          {/* Details */}
          <View style={styles.details}>
            <View style={styles.detailRow}>
              <MaterialCommunityIcons
                name="percent-outline"
                size={16}
                color={theme.colors.textSecondary}
              />
              <Text
                style={[
                  styles.detailText,
                  { color: theme.colors.textSecondary },
                ]}
              >
                {loan.interestRate}% APR
              </Text>
            </View>
            <View style={styles.detailRow}>
              <MaterialCommunityIcons
                name="calendar-range"
                size={16}
                color={theme.colors.textSecondary}
              />
              <Text
                style={[
                  styles.detailText,
                  { color: theme.colors.textSecondary },
                ]}
              >
                {loan.term} months
              </Text>
            </View>
          </View>

          {/* Borrower Info */}
          {loan.borrowerName && (
            <View style={styles.borrowerInfo}>
              <MaterialCommunityIcons
                name="account-outline"
                size={16}
                color={theme.colors.textSecondary}
              />
              <Text
                style={[
                  styles.borrowerName,
                  { color: theme.colors.textSecondary },
                ]}
              >
                {loan.borrowerName}
              </Text>
              {loan.borrowerReputation && (
                <View style={styles.reputation}>
                  <MaterialCommunityIcons
                    name="star"
                    size={14}
                    color={theme.colors.warning}
                  />
                  <Text
                    style={[
                      styles.reputationText,
                      { color: theme.colors.textSecondary },
                    ]}
                  >
                    {loan.borrowerReputation.toFixed(1)}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Progress Bar (if partially funded) */}
          {loan.fundedAmount !== undefined &&
            loan.remainingAmount !== undefined && (
              <View style={styles.progressContainer}>
                <View
                  style={[
                    styles.progressBar,
                    { backgroundColor: theme.colors.border },
                  ]}
                >
                  <View
                    style={[
                      styles.progressFill,
                      {
                        backgroundColor: theme.colors.primary,
                        width: `${progress}%`,
                      },
                    ]}
                  />
                </View>
                <Text
                  style={[
                    styles.progressText,
                    { color: theme.colors.textSecondary },
                  ]}
                >
                  {formatCurrency(loan.fundedAmount)} /{" "}
                  {formatCurrency(loan.amount)}
                </Text>
              </View>
            )}
        </View>
      </Card>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginVertical: 8,
  },
  cardContent: {
    padding: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  amount: {
    fontSize: 24,
    fontWeight: "bold",
  },
  riskChip: {
    height: 24,
  },
  chipText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#fff",
  },
  purpose: {
    fontSize: 14,
    marginBottom: 12,
  },
  details: {
    flexDirection: "row",
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 16,
  },
  detailText: {
    fontSize: 12,
    marginLeft: 4,
  },
  borrowerInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  borrowerName: {
    fontSize: 12,
    marginLeft: 4,
  },
  reputation: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
  },
  reputationText: {
    fontSize: 12,
    marginLeft: 2,
  },
  progressContainer: {
    marginTop: 12,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
  },
  progressText: {
    fontSize: 10,
    marginTop: 4,
    textAlign: "right",
  },
});

export default LoanCard;
