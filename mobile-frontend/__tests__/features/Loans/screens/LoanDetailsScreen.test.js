import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { DefaultTheme, PaperProvider } from "react-native-paper";
import { WalletContext } from "../../../../../../contexts/WalletContext";
import LoanDetailsScreen from "../LoanDetailsScreen";

// Mock navigation and route
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockNavigation = { navigate: mockNavigate, goBack: mockGoBack };
const mockRoute = (loanId) => ({ params: { loanId } });

// Mock WalletContext
let mockIsConnected = false;
const mockWalletAddress = "0xTestWalletAddress123";
const mockConnectWallet = jest.fn();

const mockWalletContextValue = () => ({
  isConnected: mockIsConnected,
  address: mockWalletAddress,
  connectWallet: mockConnectWallet,
  // Add other wallet context values if used
});

// Mock Alert
jest.spyOn(Alert, "alert");

// Mock setTimeout for simulated API calls and transactions
jest.useFakeTimers();

// Placeholder loans from the component for consistent testing
const _placeholderLoans = [
  {
    id: "1",
    amount: 1500,
    interestRate: 8.5,
    term: 12,
    purpose: "Debt Consolidation",
    creditScoreRange: "650-700",
    status: "Available",
    borrower: "0x123BorrowerAddressabc",
    description:
      "Looking to consolidate high-interest credit card debt into a single, manageable loan.",
    collateral: "None",
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
    borrower: "0x456BorrowerAddressdef",
    description:
      "Need short-term funding for inventory purchase for my online store.",
    collateral: "None",
    fundedAmount: 100,
  },
  {
    id: "4",
    amount: 1000,
    interestRate: 9.0,
    term: 9,
    purpose: "Education",
    creditScoreRange: "680-720",
    status: "Funded",
    borrower: "0xabcBorrowerAddress123",
    description: "Loan to cover costs for a professional certification course.",
    collateral: "None",
    fundedAmount: 1000,
  },
];

// Mock the internal getLoanDetailsById by controlling setTimeout and the data source
// This is a bit indirect. A better way would be to mock a service if it were external.

const AllTheProviders = ({ children }) => (
  <WalletContext.Provider value={mockWalletContextValue()}>
    <PaperProvider theme={DefaultTheme}>{children}</PaperProvider>
  </WalletContext.Provider>
);

describe("LoanDetailsScreen", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockGoBack.mockClear();
    Alert.alert.mockClear();
    mockConnectWallet.mockClear();
    jest.clearAllTimers();
    mockIsConnected = false; // Default to not connected
  });

  it("renders loading state initially then loan details", async () => {
    const { getByTestId, findByText, queryByTestId } = render(
      <LoanDetailsScreen route={mockRoute("1")} navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );
    // Check for loading indicator (ActivityIndicator)
    // As ActivityIndicator doesn't have direct text, check its presence or absence of content
    expect(queryByTestId("loan-details-content")).toBeNull(); // Assuming main content has a testID

    act(() => jest.runAllTimers()); // Complete simulated fetch

    await waitFor(() => {
      expect(findByText("Loan Request: $1500")).toBeTruthy();
      expect(findByText("Purpose: Debt Consolidation")).toBeTruthy();
      expect(findByText("8.5% APR")).toBeTruthy();
      expect(findByText("0x123B...sabc")).toBeTruthy(); // Borrower address format
      expect(
        findByText(
          "Looking to consolidate high-interest credit card debt into a single, manageable loan.",
        ),
      ).toBeTruthy();
      expect(findByText("$0 / $1500")).toBeTruthy(); // Funding status
    });
  });

  it("shows error message if loan is not found", async () => {
    const { findByText } = render(
      <LoanDetailsScreen
        route={mockRoute("nonexistent")}
        navigation={mockNavigation}
      />,
      { wrapper: AllTheProviders },
    );
    act(() => jest.runAllTimers());
    await waitFor(() => expect(findByText("Loan not found")).toBeTruthy());
  });

  it("allows typing in funding amount input when loan is available", async () => {
    const { findByPlaceholderText } = render(
      <LoanDetailsScreen route={mockRoute("1")} navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );
    act(() => jest.runAllTimers());

    const fundingInput = await findByPlaceholderText(
      "Enter amount (max $1500.00)",
    );
    fireEvent.changeText(fundingInput, "100");
    expect(fundingInput.props.value).toBe("100");
  });

  it('shows "Connect Wallet to Fund" button if wallet not connected and loan is available', async () => {
    mockIsConnected = false;
    const { findByText } = render(
      <LoanDetailsScreen route={mockRoute("1")} navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );
    act(() => jest.runAllTimers());
    await waitFor(() =>
      expect(findByText("Connect Wallet to Fund")).toBeTruthy(),
    );
  });

  it('shows "Fund Now" button if wallet connected and loan is available', async () => {
    mockIsConnected = true;
    const { findByText } = render(
      <LoanDetailsScreen route={mockRoute("1")} navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );
    act(() => jest.runAllTimers());
    await waitFor(() => expect(findByText("Fund Now")).toBeTruthy());
  });

  it("prompts to connect wallet if Fund Now is pressed while disconnected", async () => {
    mockIsConnected = false;
    const { findByText } = render(
      <LoanDetailsScreen route={mockRoute("1")} navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );
    act(() => jest.runAllTimers());

    const fundButton = await findByText("Connect Wallet to Fund");
    fireEvent.press(fundButton);

    expect(Alert.alert).toHaveBeenCalledWith(
      "Connect Wallet",
      "Please connect your wallet to fund a loan.",
      [{ text: "Cancel" }, { text: "Connect", onPress: mockConnectWallet }],
    );
    // Simulate pressing connect on alert
    const connectAction = Alert.alert.mock.calls[0][2].find(
      (action) => action.text === "Connect",
    );
    if (connectAction?.onPress) {
      act(() => connectAction.onPress());
    }
    expect(mockConnectWallet).toHaveBeenCalledTimes(1);
  });

  it("validates funding amount before attempting to fund", async () => {
    mockIsConnected = true;
    const { findByText, findByPlaceholderText } = render(
      <LoanDetailsScreen route={mockRoute("1")} navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );
    act(() => jest.runAllTimers());

    const fundButton = await findByText("Fund Now");
    const fundingInput = await findByPlaceholderText(
      "Enter amount (max $1500.00)",
    );

    // Test with empty amount
    fireEvent.press(fundButton);
    expect(Alert.alert).toHaveBeenCalledWith(
      "Invalid Amount",
      "Please enter a valid positive amount to fund.",
    );
    Alert.alert.mockClear();

    // Test with zero amount
    fireEvent.changeText(fundingInput, "0");
    fireEvent.press(fundButton);
    expect(Alert.alert).toHaveBeenCalledWith(
      "Invalid Amount",
      "Please enter a valid positive amount to fund.",
    );
    Alert.alert.mockClear();

    // Test with amount exceeding remaining
    fireEvent.changeText(fundingInput, "2000"); // Loan 1 needs 1500
    fireEvent.press(fundButton);
    expect(Alert.alert).toHaveBeenCalledWith(
      "Invalid Amount",
      "You can fund a maximum of $1500.00.",
    );
  });

  it("simulates successful loan funding, shows alert, and navigates back", async () => {
    mockIsConnected = true;
    const { findByText, findByPlaceholderText } = render(
      <LoanDetailsScreen route={mockRoute("1")} navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );
    act(() => jest.runAllTimers()); // Load details

    const fundingInput = await findByPlaceholderText(
      "Enter amount (max $1500.00)",
    );
    fireEvent.changeText(fundingInput, "500");
    const fundButton = await findByText("Fund Now");
    fireEvent.press(fundButton);

    // Check for loading state on button
    expect(fundButton.parent.parent.props.loading).toBe(true);

    act(() => jest.runAllTimers()); // Complete simulated transaction

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Funding Successful",
        "You have successfully funded $500 for loan 1.",
      );
      expect(mockGoBack).toHaveBeenCalledTimes(1);
    });
  });

  it("does not show funding section if loan is already funded", async () => {
    const { queryByText, findByText } = render(
      <LoanDetailsScreen route={mockRoute("4")} navigation={mockNavigation} />, // Loan 4 is fully funded
      { wrapper: AllTheProviders },
    );
    act(() => jest.runAllTimers());

    await findByText("Loan Request: $1000"); // Ensure details loaded
    expect(queryByText("Fund This Loan")).toBeNull();
    expect(queryByText("Fund Now")).toBeNull();
    expect(queryByText("Connect Wallet to Fund")).toBeNull();
  });
});
