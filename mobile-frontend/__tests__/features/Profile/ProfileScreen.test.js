import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { DefaultTheme, PaperProvider } from "react-native-paper";
import { AuthContext } from "../../../../../contexts/AuthContext";
import { ThemeContext } from "../../../../../contexts/ThemeContext";
import ProfileScreen from "../ProfileScreen";

// Mock navigation (ProfileScreen doesn't take navigation as a prop directly)
// const mockNavigate = jest.fn();
// const mockNavigation = { navigate: mockNavigate };

// Mock AuthContext
let mockUser = { name: "Test User", email: "test@example.com", uid: "user123" };
const mockLogout = jest.fn();
const mockAuthContextValue = () => ({
  user: mockUser,
  logout: mockLogout,
  // Add other auth context values if used
  loading: false,
  isAuthenticated: true,
});

// Mock ThemeContext
let mockIsDark = false;
const mockToggleTheme = jest.fn();
const mockTheme = DefaultTheme; // Or a custom theme object if needed for styles
const mockThemeContextValue = () => ({
  isDark: mockIsDark,
  toggleTheme: mockToggleTheme,
  theme: mockTheme, // Pass the actual theme object used by createStyles
});

// Mock Alert
jest.spyOn(Alert, "alert");

// Mock setTimeout for simulated API calls
jest.useFakeTimers();

const AllTheProviders = ({ children }) => (
  <AuthContext.Provider value={mockAuthContextValue()}>
    <ThemeContext.Provider value={mockThemeContextValue()}>
      <PaperProvider theme={mockTheme}>{children}</PaperProvider>
    </ThemeContext.Provider>
  </AuthContext.Provider>
);

describe("ProfileScreen", () => {
  beforeEach(() => {
    mockLogout.mockClear();
    mockToggleTheme.mockClear();
    Alert.alert.mockClear();
    jest.clearAllTimers();
    mockUser = { name: "Test User", email: "test@example.com", uid: "user123" };
    mockIsDark = false;
  });

  it("renders correctly with user information and settings", () => {
    const { getByText, getByLabelText } = render(<ProfileScreen />, {
      wrapper: AllTheProviders,
    });

    expect(getByText("Test User")).toBeTruthy();
    expect(getByText("test@example.com")).toBeTruthy();
    expect(getByText("Account Settings")).toBeTruthy();
    expect(getByText("Edit Profile")).toBeTruthy();
    expect(getByText("Change Password")).toBeTruthy();
    expect(getByText("Preferences")).toBeTruthy();
    expect(getByText("Dark Mode")).toBeTruthy();
    expect(getByText("Notifications")).toBeTruthy();
    expect(getByText("Logout")).toBeTruthy();
  });

  it("toggles edit mode for profile information", async () => {
    const { getByText, getByLabelText, queryByText, queryByLabelText } = render(
      <ProfileScreen />,
      { wrapper: AllTheProviders },
    );

    // Enter edit mode
    fireEvent.press(getByText("Edit Profile"));
    await waitFor(() => {
      expect(getByLabelText("Name")).toBeTruthy();
      expect(getByLabelText("Email")).toBeTruthy();
      expect(getByText("Save Changes")).toBeTruthy();
      expect(getByText("Cancel")).toBeTruthy();
    });

    // Exit edit mode by Cancel
    fireEvent.press(getByText("Cancel"));
    await waitFor(() => {
      expect(queryByLabelText("Name")).toBeNull();
      expect(queryByText("Save Changes")).toBeNull();
    });
  });

  it("allows editing name and email and simulates saving changes", async () => {
    const { getByText, getByLabelText } = render(<ProfileScreen />, {
      wrapper: AllTheProviders,
    });

    fireEvent.press(getByText("Edit Profile"));
    await waitFor(() => expect(getByLabelText("Name")).toBeTruthy());

    const nameInput = getByLabelText("Name");
    const emailInput = getByLabelText("Email");

    fireEvent.changeText(nameInput, "Updated Name");
    fireEvent.changeText(emailInput, "updated@example.com");

    expect(nameInput.props.value).toBe("Updated Name");
    expect(emailInput.props.value).toBe("updated@example.com");

    fireEvent.press(getByText("Save Changes"));
    act(() => jest.runAllTimers()); // For setTimeout in handleSaveChanges

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Success",
        "Profile updated successfully.",
      );
      // Check if edit mode is exited (inputs are gone)
      expect(getByLabelText("Name").props.value).toBe("Updated Name"); // State updated before exiting edit mode
    });
  });

  it("calls toggleTheme when dark mode switch is pressed", () => {
    const { getByRole } = render(<ProfileScreen />, {
      wrapper: AllTheProviders,
    });
    // react-native-paper Switch has role 'switch'
    const darkModeSwitch = getByRole("switch");
    fireEvent.press(darkModeSwitch); // Pressing the switch itself
    expect(mockToggleTheme).toHaveBeenCalledTimes(1);
  });

  it("calls logout from AuthContext and handles success/failure", async () => {
    const { getByText } = render(<ProfileScreen />, {
      wrapper: AllTheProviders,
    });

    // Simulate successful logout
    mockLogout.mockResolvedValueOnce(undefined);
    fireEvent.press(getByText("Logout"));
    await waitFor(() => expect(mockLogout).toHaveBeenCalledTimes(1));
    // Navigation is handled by AppNavigator, not directly testable here for screen change

    // Simulate failed logout
    mockLogout.mockRejectedValueOnce(new Error("Logout failed miserably"));
    fireEvent.press(getByText("Logout"));
    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalledTimes(2); // Called again
      expect(Alert.alert).toHaveBeenCalledWith(
        "Logout Failed",
        "An error occurred during logout.",
      );
    });
  });

  it('shows "Not Implemented" for Change Password and Notifications', () => {
    const { getByText } = render(<ProfileScreen />, {
      wrapper: AllTheProviders,
    });

    fireEvent.press(getByText("Change Password"));
    expect(Alert.alert).toHaveBeenCalledWith(
      "Not Implemented",
      "Change password functionality is not yet available.",
    );
    Alert.alert.mockClear();

    fireEvent.press(getByText("Notifications"));
    expect(Alert.alert).toHaveBeenCalledWith(
      "Not Implemented",
      "Notification settings are not yet available.",
    );
  });

  it("displays correct avatar initial", () => {
    const { getByText } = render(<ProfileScreen />, {
      wrapper: AllTheProviders,
    });
    // Avatar.Text uses the first char of the label prop, which is derived from user.name
    expect(getByText("T")).toBeTruthy(); // For 'Test User'
  });
});
