import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useTheme } from "react-native-paper";
import MarketplaceScreen from "../features/Loans/MarketplaceScreen";
import LoanDetailsScreen from "../features/Loans/screens/LoanDetailsScreen"; // Corrected path

const Stack = createNativeStackNavigator();

const MarketplaceNavigator = () => {
  const theme = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.surface,
        },
        headerTintColor: theme.colors.textPrimary,
        headerTitleStyle: {
          fontFamily: theme.fonts.primarySemiBold, // Use theme font
        },
      }}
    >
      <Stack.Screen
        name="MarketplaceList"
        component={MarketplaceScreen}
        options={{ title: "Loan Marketplace" }}
      />
      <Stack.Screen
        name="LoanDetails"
        component={LoanDetailsScreen}
        options={({ route }) => ({
          title: `Loan Details`, // Title can be dynamic if needed
          // Example: title: `Loan #${route.params?.loanId}`
        })}
      />
    </Stack.Navigator>
  );
};

export default MarketplaceNavigator;
