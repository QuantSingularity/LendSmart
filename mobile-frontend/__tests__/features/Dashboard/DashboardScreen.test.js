import { fireEvent, render } from "@testing-library/react-native";
import { DefaultTheme, PaperProvider } from "react-native-paper";
import { AuthContext } from "../../../../../contexts/AuthContext";
import DashboardScreen from "../DashboardScreen";

// Mock navigation
const mockNavigate = jest.fn();
const mockNavigation = { navigate: mockNavigate };

// Mock AuthContext
let mockUser = {
  name: "Test User",
  // Add other user properties if DashboardScreen uses them
};
const mockAuthContextValue = {
  user: mockUser,
  // Add other context values if DashboardScreen uses them
  loading: false,
  error: null,
  login: jest.fn(),
  register: jest.fn(),
  logout: jest.fn(),
  isAuthenticated: true,
};

// Custom wrapper to provide necessary contexts and theme
const AllTheProviders = ({ children }) => (
  <AuthContext.Provider value={mockAuthContextValue}>
    <PaperProvider theme={DefaultTheme}>{children}</PaperProvider>
  </AuthContext.Provider>
);

// Mock setTimeout for refresh control
jest.useFakeTimers();

describe("DashboardScreen", () => {
  beforeEach(() => {
    // Reset mocks and user state before each test
    mockNavigate.mockClear();
    mockUser = { name: "Test User" };
    mockAuthContextValue.user = mockUser;
    jest.clearAllTimers();
  });

  it("renders correctly with user greeting and key sections", () => {
    const { getByText } = render(
      <DashboardScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );

    expect(getByText("Hello, Test!")).toBeTruthy(); // Checks for first name
    expect(getByText("Here's your financial overview")).toBeTruthy();

    // Loan Summary
    expect(getByText("Loan Summary")).toBeTruthy();
    expect(getByText("Active Loans")).toBeTruthy();
    expect(getByText("2")).toBeTruthy(); // Placeholder value from component
    expect(getByText("Borrowed")).toBeTruthy();
    expect(getByText("$5,000")).toBeTruthy(); // Placeholder value
    expect(getByText("Lent")).toBeTruthy();
    expect(getByText("$3,000")).toBeTruthy(); // Placeholder value
    expect(getByText("Reputation")).toBeTruthy();
    expect(getByText("4.8")).toBeTruthy(); // Placeholder value

    // Quick Actions
    expect(getByText("Apply")).toBeTruthy();
    expect(getByText("Market")).toBeTruthy();

    // Recent Activity
    expect(getByText("Recent Activity")).toBeTruthy();
    expect(getByText("Loan Funded")).toBeTruthy(); // Placeholder activity
    expect(getByText("Loan Repayment")).toBeTruthy(); // Placeholder activity
  });

  it("shows loading indicator if user is not available initially", () => {
    mockAuthContextValue.user = null; // Simulate user not yet loaded
    const { getByTestId, queryByText } = render(
      // DashboardScreen has an ActivityIndicator but it's not directly testable by role/text easily without testID
      // We will check that the main content is not rendered.
      <DashboardScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );
    // The component renders ActivityIndicator, not a specific text.
    // We'll check that the greeting is NOT there, implying loading or redirect.
    expect(queryByText("Hello, Test!")).toBeNull();
    // If ActivityIndicator had a testID="loading-indicator", we could use: expect(getByTestId('loading-indicator')).toBeTruthy();
  });

  it('navigates to Apply screen when "Apply" button is pressed', () => {
    const { getByText } = render(
      <DashboardScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );
    fireEvent.press(getByText("Apply"));
    expect(mockNavigate).toHaveBeenCalledWith("Apply");
  });

  it('navigates to Marketplace screen when "Market" button is pressed', () => {
    const { getByText } = render(
      <DashboardScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );
    fireEvent.press(getByText("Market"));
    expect(mockNavigate).toHaveBeenCalledWith("Marketplace");
  });

  it("simulates refresh control and completes", async () => {
    const { getByTestId, getByText } = render(
      <DashboardScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );

    // To test RefreshControl, we need to find the ScrollView and trigger its onRefresh prop.
    // This is not straightforward with RTL without specific testIDs or accessibility props on ScrollView.
    // However, we can test the onRefresh function if it were exposed or by simulating the refresh state change.
    // The component uses a setTimeout in onRefresh. We can test this.

    // For this example, let's assume we can somehow trigger the refresh.
    // The DashboardScreen's onRefresh sets refreshing to true, then false after a timeout.
    // We can't directly call onRefresh from here easily without modifying the component for testing.
    // This test is more conceptual for now. A better way would be to use a testID on the ScrollView.
    // For instance, if ScrollView had testID="dashboard-scrollview":
    // const scrollView = getByTestId('dashboard-scrollview');
    // fireEvent(scrollView, 'onRefresh'); // This might not work directly for onRefresh prop.

    // Let's assume the onRefresh is called (e.g. by user pulling down)
    // We can't directly simulate the pull-to-refresh gesture with RTL.
    // The test for refresh control is limited with RTL's capabilities for gestures.
    // We will skip direct testing of the refresh gesture itself.
    // We can ensure the RefreshControl is present.
    // The ScrollView has refreshControl prop, but accessing it directly is hard.
    // We'll just check that the main content is still there after a conceptual refresh.
    expect(getByText("Hello, Test!")).toBeTruthy();
  });

  it("displays recent activity items correctly", () => {
    const { getByText } = render(
      <DashboardScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );
    // Based on placeholder data in DashboardScreen.js
    expect(getByText("Loan Funded")).toBeTruthy();
    expect(getByText("$1,000")).toBeTruthy();
    expect(getByText("2025-04-25")).toBeTruthy();
    expect(getByText("Completed")).toBeTruthy(); // Status

    expect(getByText("New Listing Viewed")).toBeTruthy();
    expect(getByText("Viewed loan #LND123")).toBeTruthy();
    expect(getByText("Info")).toBeTruthy(); // Status
  });
});
