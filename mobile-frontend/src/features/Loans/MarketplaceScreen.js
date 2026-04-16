import PropTypes from "prop-types";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import {
  Button,
  Card,
  Chip,
  Searchbar,
  Text,
  useTheme,
} from "react-native-paper";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
// Removed direct import of spacing, use theme.spacing instead
import { getMarketplaceLoans } from "../../../services/apiService";

// Placeholder data for marketplace loans
const _placeholderLoans = [
  {
    id: "1",
    amount: 1500,
    interestRate: 8.5,
    term: 12,
    purpose: "Debt Consolidation",
    creditScoreRange: "650-700",
    status: "Available",
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
    fundedAmount: 1000,
  },
];

// Added navigation prop back
const MarketplaceScreen = ({ navigation }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const [searchQuery, setSearchQuery] = useState("");
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLoans = async (isRefreshing = false) => {
    if (!isRefreshing) setLoading(true);
    setError(null);
    try {
      // Fetch loans from API
      const response = await getMarketplaceLoans({
        search: searchQuery,
        status: "pending,approved", // Only show loans available for funding
      });
      setLoans(response.data || []);
    } catch (err) {
      console.error("Failed to fetch loans:", err);
      setError("Failed to load loan marketplace. Please try again.");
      // setLoans([]); // Clear loans on error or keep placeholders?
    } finally {
      if (!isRefreshing) setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLoans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchLoans]); // Re-fetch when search query changes

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    fetchLoans(true);
  }, [fetchLoans]);

  const onChangeSearch = (query) => setSearchQuery(query);

  const handleViewDetails = (loanId) => {
    navigation.navigate("LoanDetails", { loanId: loanId });
  };

  const handleFundLoan = (loanId) => {
    // Navigate to details screen where funding happens
    navigation.navigate("LoanDetails", { loanId: loanId, focusFund: true });
  };

  const renderLoanItem = ({ item }) => {
    const fundedPercent =
      item.amount > 0 ? ((item.fundedAmount || 0) / item.amount) * 100 : 0;
    return (
      <Card style={styles.loanCard} onPress={() => handleViewDetails(item.id)}>
        <Card.Title
          title={`$${item.amount.toLocaleString()}`}
          subtitle={`${item.interestRate}% APR | ${item.term} Months`}
          titleStyle={styles.cardTitle}
          subtitleStyle={styles.cardSubtitle}
          right={(props) => (
            <Chip
              {...props}
              icon={
                item.status === "Available"
                  ? "check-circle-outline"
                  : "information-outline"
              }
              style={[
                styles.statusChip,
                {
                  backgroundColor:
                    item.status === "Available"
                      ? theme.colors.success
                      : theme.colors.disabled,
                },
              ]}
              textStyle={styles.statusChipText}
            >
              {item.status}
            </Chip>
          )}
          rightStyle={styles.cardTitleRight}
        />
        <Card.Content>
          <View style={styles.detailRow}>
            <MaterialCommunityIcons
              name="briefcase-outline"
              size={16}
              color={theme.colors.textSecondary}
              style={styles.detailIcon}
            />
            <Text style={styles.detailText}>{item.purpose}</Text>
          </View>
          <View style={styles.detailRow}>
            <MaterialCommunityIcons
              name="credit-card-scan-outline"
              size={16}
              color={theme.colors.textSecondary}
              style={styles.detailIcon}
            />
            <Text style={styles.detailText}>
              Score: {item.creditScoreRange}
            </Text>
          </View>
          {/* Funding Progress Bar */}
          {item.status === "Available" && item.fundedAmount > 0 && (
            <View style={styles.progressContainer}>
              <View
                style={[
                  styles.progressBar,
                  {
                    width: `${fundedPercent}%`,
                    backgroundColor: theme.colors.primary,
                  },
                ]}
              />
            </View>
          )}
          <Text style={styles.fundedText}>
            {item.status === "Funded"
              ? "Fully Funded"
              : `$${(item.fundedAmount || 0).toLocaleString()} / $${item.amount.toLocaleString()} funded (${fundedPercent.toFixed(0)}%)`}
          </Text>
        </Card.Content>
        <Card.Actions style={styles.cardActions}>
          <Button
            icon="information-outline"
            onPress={() => handleViewDetails(item.id)}
          >
            Details
          </Button>
          <Button
            mode="contained"
            icon="cash-plus"
            disabled={item.status !== "Available"}
            onPress={() => handleFundLoan(item.id)}
            style={styles.fundButton}
          >
            Fund
          </Button>
        </Card.Actions>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      <Searchbar
        placeholder="Search loans..."
        onChangeText={onChangeSearch}
        value={searchQuery}
        style={styles.searchbar}
        icon="magnify"
      />
      {/* TODO: Add Filter Chips/Button here */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Button onPress={() => fetchLoans()}>Retry</Button>
        </View>
      ) : (
        <FlatList
          data={loans}
          renderItem={renderLoanItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
            />
          }
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons
                name="database-off-outline"
                size={48}
                color={theme.colors.textTertiary}
              />
              <Text style={styles.emptyText}>No loans found.</Text>
              {searchQuery ? (
                <Text style={styles.emptySubText}>
                  Try adjusting your search.
                </Text>
              ) : (
                <Text style={styles.emptySubText}>Pull down to refresh.</Text>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
};

// Add prop types validation
MarketplaceScreen.propTypes = {
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
    searchbar: {
      marginHorizontal: theme.spacing.lg,
      marginTop: theme.spacing.md,
      marginBottom: theme.spacing.sm,
      borderRadius: theme.borderRadius.lg,
      elevation: 2,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    errorContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: theme.spacing.lg,
    },
    errorText: {
      color: theme.colors.error,
      textAlign: "center",
      marginBottom: theme.spacing.md,
      fontSize: theme.fontSizes.body1,
      fontFamily: theme.fonts.primary,
    },
    listContainer: {
      paddingHorizontal: theme.spacing.lg,
      paddingBottom: theme.spacing.lg,
    },
    loanCard: {
      marginBottom: theme.spacing.lg,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.lg,
      elevation: 3,
    },
    cardTitle: {
      fontFamily: theme.fonts.primaryBold,
      fontSize: theme.fontSizes.h4,
      color: theme.colors.textPrimary,
    },
    cardSubtitle: {
      fontFamily: theme.fonts.primary,
      fontSize: theme.fontSizes.body2,
      color: theme.colors.textSecondary,
    },
    cardTitleRight: {
      marginRight: theme.spacing.md,
      marginTop: theme.spacing.sm, // Align chip better
    },
    statusChip: {
      paddingHorizontal: theme.spacing.sm,
      height: 24,
      alignItems: "center",
      justifyContent: "center",
    },
    statusChipText: {
      color: "#fff",
      fontFamily: theme.fonts.primaryMedium,
      fontSize: theme.fontSizes.caption,
    },
    detailRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: theme.spacing.sm,
    },
    detailIcon: {
      marginRight: theme.spacing.sm,
    },
    detailText: {
      fontFamily: theme.fonts.primary,
      fontSize: theme.fontSizes.body2,
      color: theme.colors.textPrimary,
      flexShrink: 1, // Allow text to wrap
    },
    progressContainer: {
      height: 6,
      backgroundColor: theme.colors.border,
      borderRadius: theme.borderRadius.sm,
      marginTop: theme.spacing.sm,
      overflow: "hidden",
    },
    progressBar: {
      height: "100%",
    },
    fundedText: {
      fontFamily: theme.fonts.primary,
      fontSize: theme.fontSizes.caption,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.xs,
      textAlign: "right",
    },
    cardActions: {
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing.sm, // Reduce padding slightly
    },
    fundButton: {
      // marginLeft: theme.spacing.sm,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      marginTop: 80, // Adjust as needed
      paddingHorizontal: theme.spacing.xl,
    },
    emptyText: {
      fontSize: theme.fontSizes.h6,
      fontFamily: theme.fonts.primaryMedium,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.md,
      textAlign: "center",
    },
    emptySubText: {
      fontSize: theme.fontSizes.body2,
      fontFamily: theme.fonts.primary,
      color: theme.colors.textTertiary,
      marginTop: theme.spacing.xs,
      textAlign: "center",
    },
  });

export default MarketplaceScreen;
