import PropTypes from "prop-types";
import React, { useCallback, useContext, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  Card,
  Divider,
  Text,
  useTheme,
} from "react-native-paper";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
// Removed direct import of spacing, use theme.spacing instead
import { AuthContext } from "../../../contexts/AuthContext";
import { getMyLoans } from "../../../services/apiService";

const DashboardScreen = ({ navigation }) => {
  const { user } = useContext(AuthContext);
  const theme = useTheme();
  const styles = createStyles(theme);
  const [refreshing, setRefreshing] = useState(false);
  const [_loading, setLoading] = useState(true);
  const [loanSummary, setLoanSummary] = useState({
    activeLoans: 0,
    totalBorrowed: 0,
    totalLent: 0,
    reputation: 0,
  });
  const [recentActivity, setRecentActivity] = useState([]);

  // Fetch dashboard data
  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await getMyLoans();
      const loans = response.data || [];

      // Calculate summary
      const summary = loans.reduce(
        (acc, loan) => {
          if (loan.status === "active" || loan.status === "repaying") {
            acc.activeLoans++;
          }
          if (loan.borrowerId === user?.id) {
            acc.totalBorrowed += loan.amount;
          } else {
            acc.totalLent += loan.fundedAmount || 0;
          }
          return acc;
        },
        {
          activeLoans: 0,
          totalBorrowed: 0,
          totalLent: 0,
          reputation: user?.reputation || 4.5,
        },
      );

      setLoanSummary(summary);

      // Convert loans to activity items
      const activities = loans.slice(0, 5).map((loan) => ({
        id: loan.id,
        type: loan.status === "pending" ? "Loan Application" : "Loan Activity",
        amount: `$${loan.amount.toLocaleString()}`,
        date: new Date(loan.createdAt).toLocaleDateString(),
        status: loan.status.charAt(0).toUpperCase() + loan.status.slice(1),
        icon:
          loan.status === "active"
            ? "cash-check"
            : "file-document-edit-outline",
      }));
      setRecentActivity(activities);
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
      // Use placeholder data on error
      setRecentActivity(placeholderActivity);
    } finally {
      setLoading(false);
    }
  }, [user, placeholderActivity]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDashboardData();
    setRefreshing(false);
  }, [fetchDashboardData]);

  // Placeholder data for fallback
  const placeholderActivity = [
    {
      id: 1,
      type: "Loan Funded",
      amount: "$1,000",
      date: "2025-04-25",
      status: "Completed",
      icon: "cash-check",
    },
    {
      id: 2,
      type: "Loan Repayment",
      amount: "$250",
      date: "2025-04-20",
      status: "Completed",
      icon: "cash-refund",
    },
    {
      id: 3,
      type: "Loan Application",
      amount: "$2,000",
      date: "2025-04-15",
      status: "Pending",
      icon: "file-document-edit-outline",
    },
    {
      id: 4,
      type: "New Listing Viewed",
      description: "Viewed loan #LND123",
      date: "2025-04-28",
      status: "Info",
      icon: "eye-outline",
    },
  ];

  if (!user) {
    // This should ideally not happen if navigation is set up correctly,
    // but good as a fallback.
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const getStatusStyle = (status) => {
    switch (status) {
      case "Completed":
        return { color: theme.colors.success, icon: "check-circle" };
      case "Pending":
        return { color: theme.colors.warning, icon: "clock-outline" };
      case "Failed":
        return { color: theme.colors.error, icon: "alert-circle-outline" };
      default:
        return {
          color: theme.colors.textSecondary,
          icon: "information-outline",
        };
    }
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.colors.primary}
        />
      }
    >
      {/* Header Section */}
      <View style={styles.header}>
        <Text style={styles.greeting}>
          Hello, {user?.name?.split(" ")[0] || "User"}!
        </Text>
        <Text style={styles.subGreeting}>Here's your financial overview</Text>
      </View>

      {/* Loan Summary Card */}
      <Card style={styles.summaryCard}>
        <Card.Content>
          <Text style={styles.cardTitle}>Loan Summary</Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <MaterialCommunityIcons
                name="cash-multiple"
                size={24}
                color={theme.colors.primary}
              />
              <Text style={styles.summaryValue}>{loanSummary.activeLoans}</Text>
              <Text style={styles.summaryLabel}>Active Loans</Text>
            </View>
            <View style={styles.summaryItem}>
              <MaterialCommunityIcons
                name="arrow-down-bold-circle-outline"
                size={24}
                color={theme.colors.error}
              />
              <Text style={styles.summaryValue}>
                ${loanSummary.totalBorrowed.toLocaleString()}
              </Text>
              <Text style={styles.summaryLabel}>Borrowed</Text>
            </View>
            <View style={styles.summaryItem}>
              <MaterialCommunityIcons
                name="arrow-up-bold-circle-outline"
                size={24}
                color={theme.colors.success}
              />
              <Text style={styles.summaryValue}>
                ${loanSummary.totalLent.toLocaleString()}
              </Text>
              <Text style={styles.summaryLabel}>Lent</Text>
            </View>
            <View style={styles.summaryItem}>
              <MaterialCommunityIcons
                name="star-circle-outline"
                size={24}
                color={theme.colors.warning}
              />
              <Text style={styles.summaryValue}>
                {loanSummary.reputation.toFixed(1)}
              </Text>
              <Text style={styles.summaryLabel}>Reputation</Text>
            </View>
          </View>
        </Card.Content>
      </Card>

      {/* Quick Actions */}
      <View style={styles.actionsContainer}>
        <Button
          mode="contained"
          style={styles.actionButton}
          contentStyle={styles.actionButtonContent}
          labelStyle={styles.actionButtonLabel}
          icon="plus-circle-outline"
          onPress={() => navigation.navigate("Apply")}
        >
          Apply
        </Button>
        <Button
          mode="outlined"
          style={styles.actionButton}
          contentStyle={styles.actionButtonContent}
          labelStyle={styles.actionButtonLabel}
          icon="storefront-outline"
          onPress={() => navigation.navigate("Marketplace")}
        >
          Market
        </Button>
        {/* Add more actions if needed, e.g., Wallet */}
        {/* <Button mode="outlined" style={styles.actionButton} icon="wallet-outline" onPress={() => {}}>Wallet</Button> */}
      </View>

      {/* Recent Activity Section */}
      <View style={styles.recentActivityContainer}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        {recentActivity.length > 0 ? (
          recentActivity.map((activity, index) => {
            const statusInfo = getStatusStyle(activity.status);
            return (
              <React.Fragment key={activity.id}>
                <Card style={styles.activityCard} elevation={0}>
                  <Card.Content style={styles.activityCardContent}>
                    <MaterialCommunityIcons
                      name={activity.icon || statusInfo.icon}
                      size={24}
                      color={statusInfo.color}
                      style={styles.activityIcon}
                    />
                    <View style={styles.activityDetails}>
                      <Text style={styles.activityType}>{activity.type}</Text>
                      {activity.description && (
                        <Text style={styles.activityDescription}>
                          {activity.description}
                        </Text>
                      )}
                      <Text style={styles.activityDate}>{activity.date}</Text>
                    </View>
                    <View style={styles.activityAmountStatus}>
                      {activity.amount && (
                        <Text style={styles.activityAmount}>
                          {activity.amount}
                        </Text>
                      )}
                      <Text
                        style={[
                          styles.activityStatus,
                          { color: statusInfo.color },
                        ]}
                      >
                        {activity.status}
                      </Text>
                    </View>
                  </Card.Content>
                </Card>
                {index < recentActivity.length - 1 && (
                  <Divider style={styles.divider} />
                )}
              </React.Fragment>
            );
          })
        ) : (
          <Text style={styles.noActivityText}>No recent activity.</Text>
        )}
        {/* Optionally add a 'View All' button */}
        {/* <Button mode="text" onPress={() => {}}>View All Activity</Button> */}
      </View>
    </ScrollView>
  );
};

DashboardScreen.propTypes = {
  navigation: PropTypes.shape({
    navigate: PropTypes.func.isRequired,
  }).isRequired,
};

// Updated createStyles using modernized theme
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
    header: {
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.lg, // Adjust top padding as needed
      paddingBottom: theme.spacing.md,
    },
    greeting: {
      fontSize: theme.fontSizes.h2,
      fontFamily: theme.fonts.primaryBold,
      color: theme.colors.textPrimary,
      marginBottom: theme.spacing.xs,
    },
    subGreeting: {
      fontSize: theme.fontSizes.body1,
      fontFamily: theme.fonts.primary,
      color: theme.colors.textSecondary,
    },
    summaryCard: {
      marginHorizontal: theme.spacing.lg,
      marginTop: theme.spacing.sm,
      marginBottom: theme.spacing.lg,
      borderRadius: theme.borderRadius.lg,
      backgroundColor: theme.colors.surface,
      elevation: 4,
    },
    cardTitle: {
      fontSize: theme.fontSizes.h5,
      fontFamily: theme.fonts.primarySemiBold,
      color: theme.colors.textPrimary,
      marginBottom: theme.spacing.md,
    },
    summaryGrid: {
      flexDirection: "row",
      flexWrap: "wrap", // Arrange items in a grid
      justifyContent: "space-around",
    },
    summaryItem: {
      alignItems: "center",
      width: "45%", // Roughly two items per row
      marginBottom: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
    },
    summaryValue: {
      fontSize: theme.fontSizes.h4,
      fontFamily: theme.fonts.primaryBold,
      color: theme.colors.textPrimary,
      marginTop: theme.spacing.xs,
    },
    summaryLabel: {
      fontSize: theme.fontSizes.caption,
      fontFamily: theme.fonts.primary,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.xxs,
    },
    actionsContainer: {
      flexDirection: "row",
      justifyContent: "space-around", // Space out buttons
      paddingHorizontal: theme.spacing.lg,
      marginBottom: theme.spacing.lg,
    },
    actionButton: {
      flex: 1, // Allow buttons to grow
      marginHorizontal: theme.spacing.sm,
      borderRadius: theme.borderRadius.lg,
      elevation: 2,
    },
    actionButtonContent: {
      paddingVertical: theme.spacing.xs,
    },
    actionButtonLabel: {
      fontFamily: theme.fonts.primaryMedium,
      fontSize: theme.fontSizes.body2,
    },
    recentActivityContainer: {
      paddingHorizontal: theme.spacing.lg,
      marginBottom: theme.spacing.xl,
    },
    sectionTitle: {
      fontSize: theme.fontSizes.h5,
      fontFamily: theme.fonts.primarySemiBold,
      color: theme.colors.textPrimary,
      marginBottom: theme.spacing.md,
    },
    activityCard: {
      backgroundColor: theme.colors.surface, // Use surface color for cards
      borderRadius: theme.borderRadius.md,
      // Removed margin bottom, using divider instead
    },
    activityCardContent: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.md,
    },
    activityIcon: {
      marginRight: theme.spacing.md,
    },
    activityDetails: {
      flex: 1,
    },
    activityType: {
      fontSize: theme.fontSizes.body1,
      fontFamily: theme.fonts.primaryMedium,
      color: theme.colors.textPrimary,
    },
    activityDescription: {
      fontSize: theme.fontSizes.caption,
      fontFamily: theme.fonts.primary,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.xxs,
    },
    activityDate: {
      fontSize: theme.fontSizes.caption,
      fontFamily: theme.fonts.primary,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.xs,
    },
    activityAmountStatus: {
      alignItems: "flex-end",
    },
    activityAmount: {
      fontSize: theme.fontSizes.body1,
      fontFamily: theme.fonts.primarySemiBold,
      color: theme.colors.textPrimary,
      marginBottom: theme.spacing.xs,
    },
    activityStatus: {
      fontSize: theme.fontSizes.caption,
      fontFamily: theme.fonts.primaryMedium,
      // Color is set dynamically
    },
    divider: {
      // Divider between activity items, no extra margin needed
      backgroundColor: theme.colors.border,
    },
    noActivityText: {
      textAlign: "center",
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.lg,
      fontFamily: theme.fonts.primary,
      fontSize: theme.fontSizes.body1,
    },
  });

export default DashboardScreen;
