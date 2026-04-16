import { createNativeStackNavigator } from "@react-navigation/native-stack";
// Placeholder for Forgot Password, etc.
import { Text, View } from "react-native";
// Import actual screen components
import LoginScreen from "../features/Auth/screens/LoginScreen";
import RegisterScreen from "../features/Auth/screens/RegisterScreen";

const _PlaceholderScreen = ({ route }) => (
  <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
    <Text>{route.name} Screen (Placeholder)</Text>
  </View>
);

const Stack = createNativeStackNavigator();

const AuthNavigator = () => {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      {/* Add other auth-related screens like Forgot Password here */}
      {/* <Stack.Screen name="ForgotPassword" component={PlaceholderScreen} /> */}
    </Stack.Navigator>
  );
};

export default AuthNavigator;
