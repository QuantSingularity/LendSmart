import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useContext } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTheme } from "react-native-paper";
import { AuthContext } from "../contexts/AuthContext";
import AuthNavigator from "./AuthNavigator";
import MainTabNavigator from "./MainTabNavigator";

const Stack = createNativeStackNavigator();

const AppNavigator = () => {
  const { token, loading } = useContext(AuthContext);
  const theme = useTheme();

  if (loading) {
    // Show a loading screen while checking auth state
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: theme.colors.background,
        }}
      >
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={{ dark: theme.dark, colors: theme.colors }}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {token ? (
          // User is signed in
          <Stack.Screen name="MainApp" component={MainTabNavigator} />
        ) : (
          // User is not signed in
          <Stack.Screen name="Auth" component={AuthNavigator} />
        )}
        {/* Add other global screens like Modals here if needed */}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
