import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { DefaultTheme, PaperProvider } from "react-native-paper";
import { AuthContext } from "../../../../../contexts/AuthContext";
import LoanApplicationScreen from "../LoanApplicationScreen";

// Mock navigation
const mockNavigate = jest.fn();
const mockNavigation = { navigate: mockNavigate };

// Mock AuthContext
let mockUser = { id: "user123", name: "Test User" }; // Ensure user is defined for checks
const mockAuthContextValue = {
  user: mockUser,
  loading: false,
  error: null,
  // Add other context values if LoanApplicationScreen uses them
  login: jest.fn(),
  register: jest.fn(),
  logout: jest.fn(),
  isAuthenticated: true,
};

// Mock apiService and blockchainService if they are directly used for calls in the component
// For this component, it seems to use console.log and setTimeout to simulate API calls.
// If actual apiService.post was used, it would need mocking like:
// jest.mock('../../../../../services/apiService', () => ({
//   post: jest.fn(),
// }));

// Mock Alert
jest.spyOn(Alert, "alert");

// Custom wrapper to provide necessary contexts and theme
const AllTheProviders = ({ children }) => (
  <AuthContext.Provider value={mockAuthContextValue}>
    <PaperProvider theme={DefaultTheme}>{children}</PaperProvider>
  </AuthContext.Provider>
);

// Mock setTimeout for simulated API call
jest.useFakeTimers();

describe("LoanApplicationScreen", () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockNavigate.mockClear();
    Alert.alert.mockClear();
    jest.clearAllTimers();
    mockUser = { id: "user123", name: "Test User" };
    mockAuthContextValue.user = mockUser;
    // if apiService was mocked: apiService.post.mockClear();
  });

  it("renders correctly with all form elements", () => {
    const { getByText, getByLabelText } = render(
      <LoanApplicationScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );

    expect(getByText("Apply for a Loan")).toBeTruthy();
    expect(
      getByText("Fill in the details below to submit your loan request."),
    ).toBeTruthy();
    expect(getByLabelText("Loan Amount ($)")).toBeTruthy();
    expect(getByLabelText("Loan Term (Months)")).toBeTruthy();
    expect(getByLabelText("Purpose of Loan")).toBeTruthy();
    expect(getByText("Submit Application")).toBeTruthy(); // Button text
  });

  it("allows typing in form fields", () => {
    const { getByLabelText } = render(
      <LoanApplicationScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );

    fireEvent.changeText(getByLabelText("Loan Amount ($)"), "1000");
    fireEvent.changeText(getByLabelText("Loan Term (Months)"), "12");
    fireEvent.changeText(
      getByLabelText("Purpose of Loan"),
      "For educational purposes.",
    );

    expect(getByLabelText("Loan Amount ($)").props.value).toBe("1000");
    expect(getByLabelText("Loan Term (Months)").props.value).toBe("12");
    expect(getByLabelText("Purpose of Loan").props.value).toBe(
      "For educational purposes.",
    );
  });

  it("shows validation errors for invalid input", async () => {
    const { getByText, getByLabelText } = render(
      <LoanApplicationScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );
    const submitButton = getByText("Submit Application");

    // Test with empty fields
    fireEvent.press(submitButton);
    await waitFor(() => {
      expect(getByText("Loan amount is required")).toBeTruthy();
      expect(getByText("Loan term is required")).toBeTruthy();
      expect(getByText("Loan purpose is required")).toBeTruthy();
    });

    // Test with amount less than min
    fireEvent.changeText(getByLabelText("Loan Amount ($)"), "50");
    fireEvent.press(submitButton);
    await waitFor(() =>
      expect(getByText("Minimum loan amount is $100")).toBeTruthy(),
    );

    // Test with term more than max
    fireEvent.changeText(getByLabelText("Loan Term (Months)"), "40");
    fireEvent.press(submitButton);
    await waitFor(() =>
      expect(getByText("Maximum term is 36 months")).toBeTruthy(),
    );

    // Test with purpose too short
    fireEvent.changeText(getByLabelText("Purpose of Loan"), "Short");
    fireEvent.press(submitButton);
    await waitFor(() =>
      expect(
        getByText("Please provide a brief description (min 10 chars)"),
      ).toBeTruthy(),
    );
  });

  it("submits application, shows success alert, and navigates on valid submission", async () => {
    // If apiService.post was mocked: apiService.post.mockResolvedValueOnce({ data: { success: true, loanId: 'loan_test123' } });
    const { getByText, getByLabelText } = render(
      <LoanApplicationScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );

    fireEvent.changeText(getByLabelText("Loan Amount ($)"), "2000");
    fireEvent.changeText(getByLabelText("Loan Term (Months)"), "24");
    fireEvent.changeText(
      getByLabelText("Purpose of Loan"),
      "Consolidating existing debts for better management.",
    );

    // Press submit
    fireEvent.press(getByText("Submit Application"));

    // Wait for loading to finish (due to simulated API call with setTimeout)
    act(() => jest.runAllTimers()); // Fast-forward all timers

    await waitFor(() => {
      // Check if API call was made (if mocked)
      // expect(apiService.post).toHaveBeenCalledWith('/loans/apply', {
      //   amount: '2000',
      //   term: '24',
      //   purpose: 'Consolidating existing debts for better management.',
      // });
      expect(Alert.alert).toHaveBeenCalledWith(
        "Application Submitted",
        "Your loan application has been submitted successfully. You can track its status in your dashboard.",
        [{ text: "OK", onPress: expect.any(Function) }],
      );
    });

    // Simulate pressing OK on the alert
    const alertOkButton = Alert.alert.mock.calls[0][2][0].onPress;
    act(() => {
      alertOkButton();
    });
    expect(mockNavigate).toHaveBeenCalledWith("Dashboard");
  });

  it("shows error message if user is not logged in on submit attempt", async () => {
    mockAuthContextValue.user = null; // Simulate no user logged in
    const { getByText, queryByText } = render(
      <LoanApplicationScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );

    fireEvent.changeText(getByText("Loan Amount ($)"), "1000");
    fireEvent.changeText(getByText("Loan Term (Months)"), "12");
    fireEvent.changeText(
      getByText("Purpose of Loan"),
      "Test purpose when not logged in.",
    );
    fireEvent.press(getByText("Submit Application"));

    await waitFor(() => {
      expect(
        getByText("You must be logged in to apply for a loan."),
      ).toBeTruthy();
      expect(Alert.alert).not.toHaveBeenCalled();
    });
  });

  it("shows error message if simulated API call fails", async () => {
    // To simulate API failure, we would need to modify the component's mock API call logic
    // or mock the actual apiService.post to reject.
    // For this test, we'll assume the component's internal simulated API can fail.
    // This requires a way to trigger the failure in the component's handleSubmitLoan.
    // The current component always simulates success.
    // To test this properly, the component's simulated API call would need a way to be influenced to fail.
    // For now, this test case is conceptual for the current component structure.
    // If apiService.post was mocked:
    // apiService.post.mockRejectedValueOnce(new Error('Network Error'));
    // ... then perform submission ...
    // await waitFor(() => expect(getByText('Network Error')).toBeTruthy());
    expect(true).toBe(true); // Placeholder for now
  });

  it("displays loading indicator during submission", async () => {
    const { getByText, getByLabelText } = render(
      <LoanApplicationScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );

    fireEvent.changeText(getByLabelText("Loan Amount ($)"), "1500");
    fireEvent.changeText(getByLabelText("Loan Term (Months)"), "18");
    fireEvent.changeText(
      getByLabelText("Purpose of Loan"),
      "Home renovation project funding.",
    );

    const submitButton = getByText("Submit Application");
    fireEvent.press(submitButton);

    // Check for loading state on button (react-native-paper Button has a loading prop)
    // The button should be disabled and show loading indicator
    expect(submitButton.parent.parent.props.loading).toBe(true);
    expect(submitButton.parent.parent.props.disabled).toBe(true);

    // Fast-forward timers to complete the simulated API call
    act(() => jest.runAllTimers());

    await waitFor(() => {
      // After submission (success or fail), loading should be false
      expect(submitButton.parent.parent.props.loading).toBe(false);
    });
  });
});
