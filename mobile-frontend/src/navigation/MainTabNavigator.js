import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useTheme } from "react-native-paper";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";

// Import screen components and navigators
import DashboardScreen from "../features/Dashboard/DashboardScreen";
import LoanApplicationScreen from "../features/Loans/LoanApplicationScreen";
import ProfileScreen from "../features/Profile/ProfileScreen";
// Import the new MarketplaceNavigator
import MarketplaceNavigator from "./MarketplaceNavigator";

const Tab = createBottomTabNavigator();

const MainTabNavigator = () => {
  const theme = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === "Dashboard") {
            iconName = focused ? "view-dashboard" : "view-dashboard-outline";
          } else if (route.name === "MarketplaceNav") {
            // Updated name
            iconName = focused ? "storefront" : "storefront-outline";
          } else if (route.name === "Apply") {
            iconName = focused
              ? "file-document-edit"
              : "file-document-edit-outline";
          } else if (route.name === "Profile") {
            iconName = focused ? "account-circle" : "account-circle-outline";
          }

          return (
            <MaterialCommunityIcons name={iconName} size={size} color={color} />
          );
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
        // Hide the header for the tab navigator itself, as nested navigators will have their own
        headerShown: false,
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      {/* Use MarketplaceNavigator instead of MarketplaceScreen directly */}
      <Tab.Screen
        name="MarketplaceNav"
        component={MarketplaceNavigator}
        options={{ title: "Marketplace" }} // Set the tab label
      />
      <Tab.Screen
        name="Apply"
        component={LoanApplicationScreen}
        options={{ title: "Apply for Loan", headerShown: true }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ headerShown: true }}
      />
    </Tab.Navigator>
  );
};

export default MainTabNavigator;
