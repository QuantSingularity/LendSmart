import { useContext, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
// Removed unused useTheme import from react-native-paper, as theme comes from ThemeContext
import {
  Avatar,
  Button,
  Divider,
  List,
  Switch,
  Text,
  TextInput,
} from "react-native-paper";
import { AuthContext } from "../../../contexts/AuthContext";
import { ThemeContext } from "../../../contexts/ThemeContext";
import { spacing } from "../../../theme/theme";

// Removed unused Keychain import

// Removed unused navigation prop
const ProfileScreen = () => {
  const { user, logout } = useContext(AuthContext);
  // theme is correctly obtained from ThemeContext
  const { isDark, toggleTheme, theme } = useContext(ThemeContext);
  const styles = createStyles(theme);

  // Example state for editable fields
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [isEditing, setIsEditing] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      // Navigation to Auth screens happens automatically in AppNavigator
    } catch (err) {
      // Changed variable name from error to err
      console.error("Logout failed:", err); // Log the error
      Alert.alert("Logout Failed", "An error occurred during logout.");
    }
  };

  const { updateProfile } = useContext(AuthContext);

  const handleSaveChanges = async () => {
    console.log("Saving changes:", { name, email });
    try {
      // Call API to update user profile
      await updateProfile({ name, email });
      Alert.alert("Success", "Profile updated successfully.");
      setIsEditing(false);
    } catch (err) {
      console.error("Profile update failed:", err);
      Alert.alert("Update Failed", err.message || "Could not update profile.");
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.profileHeader}>
        <Avatar.Text
          size={80}
          label={user?.name?.charAt(0)?.toUpperCase() || "U"}
          style={styles.avatar}
        />
        <Text style={styles.userName}>{user?.name || "User Name"}</Text>
        <Text style={styles.userEmail}>
          {user?.email || "user@example.com"}
        </Text>
      </View>

      <List.Section title="Account Settings">
        {isEditing ? (
          <View style={styles.editSection}>
            <TextInput
              label="Name"
              value={name}
              onChangeText={setName}
              style={styles.input}
            />
            <TextInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.input}
              // Consider adding validation or disabling email editing
            />
            <View style={styles.buttonRow}>
              <Button
                onPress={() => setIsEditing(false)}
                style={styles.editButton}
              >
                Cancel
              </Button>
              <Button
                mode="contained"
                onPress={handleSaveChanges}
                style={styles.editButton}
              >
                Save Changes
              </Button>
            </View>
          </View>
        ) : (
          <List.Item
            title="Edit Profile"
            left={() => <List.Icon icon="account-edit-outline" />}
            onPress={() => setIsEditing(true)}
          />
        )}
        <List.Item
          title="Change Password"
          left={() => <List.Icon icon="lock-reset" />}
          onPress={() =>
            Alert.alert(
              "Not Implemented",
              "Change password functionality is not yet available.",
            )
          }
        />
      </List.Section>

      <Divider />

      <List.Section title="Preferences">
        <List.Item
          title="Dark Mode"
          left={() => (
            <List.Icon icon={isDark ? "weather-night" : "weather-sunny"} />
          )}
          right={() => <Switch value={isDark} onValueChange={toggleTheme} />}
        />
        <List.Item
          title="Notifications"
          left={() => <List.Icon icon="bell-outline" />}
          onPress={() =>
            Alert.alert(
              "Not Implemented",
              "Notification settings are not yet available.",
            )
          }
        />
      </List.Section>

      <Divider />

      <List.Section>
        <List.Item
          title="Logout"
          titleStyle={styles.logoutText}
          left={() => <List.Icon icon="logout" color={theme.colors.error} />}
          onPress={handleLogout}
        />
      </List.Section>
    </ScrollView>
  );
};

// Add prop types validation (currently no props)
ProfileScreen.propTypes = {};

const createStyles = (theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    profileHeader: {
      alignItems: "center",
      paddingVertical: spacing.lg,
      backgroundColor: theme.colors.surface, // Or primary color
      borderBottomLeftRadius: theme.borderRadius.xl,
      borderBottomRightRadius: theme.borderRadius.xl,
      marginBottom: spacing.md,
      elevation: 4,
    },
    avatar: {
      marginBottom: spacing.md,
      backgroundColor: theme.colors.primary,
    },
    userName: {
      fontSize: theme.fontSizes.h5,
      fontWeight: "bold",
      color: theme.colors.textPrimary,
      marginBottom: spacing.xs,
    },
    userEmail: {
      fontSize: theme.fontSizes.body1,
      color: theme.colors.textSecondary,
    },
    editSection: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
    },
    input: {
      marginBottom: spacing.sm,
      backgroundColor: theme.colors.background, // Adjust background for visibility
    },
    buttonRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      marginTop: spacing.sm,
    },
    editButton: {
      marginLeft: spacing.sm,
    },
    logoutText: {
      color: theme.colors.error,
      fontWeight: "bold",
    },
  });

export default ProfileScreen;
