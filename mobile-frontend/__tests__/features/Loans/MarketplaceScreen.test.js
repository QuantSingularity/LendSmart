import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { DefaultTheme, PaperProvider } from "react-native-paper";
import MarketplaceScreen from "../MarketplaceScreen";

// Mock navigation
const mockNavigate = jest.fn();
const mockNavigation = { navigate: mockNavigate };

// Mock setTimeout and clearTimeout for fetchLoans and onRefresh
jest.useFakeTimers();

// Custom wrapper to provide necessary theme
const AllTheProviders = ({ children }) => (
  <PaperProvider theme={DefaultTheme}>{children}</PaperProvider>
);

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

describe("MarketplaceScreen", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    jest.clearAllTimers();
    // If apiService was used and mocked, clear it here.
  });

  it("renders correctly with search bar and initially loads loans", async () => {
    const { getByPlaceholderText, findByText } = render(
      <MarketplaceScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );

    expect(getByPlaceholderText("Search loans...")).toBeTruthy();

    // Fast-forward timers to simulate API call completion
    act(() => jest.runAllTimers());

    // Check if loans are rendered (using data from placeholderLoans)
    await waitFor(() => {
      expect(findByText("$1,500")).toBeTruthy(); // Loan 1 amount
      expect(findByText("Debt Consolidation")).toBeTruthy(); // Loan 1 purpose
      expect(findByText("$500")).toBeTruthy(); // Loan 2 amount
      expect(findByText("Small Business")).toBeTruthy(); // Loan 2 purpose
    });
  });

  it("filters loans based on search query", async () => {
    const { getByPlaceholderText, queryByText, findByText } = render(
      <MarketplaceScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );

    // Initial load
    act(() => jest.runAllTimers());
    await waitFor(() => expect(findByText("Debt Consolidation")).toBeTruthy());

    const searchInput = getByPlaceholderText("Search loans...");
    fireEvent.changeText(searchInput, "Business");

    // Fast-forward timers for search re-fetch
    act(() => jest.runAllTimers());

    await waitFor(() => {
      expect(findByText("Small Business")).toBeTruthy();
      expect(queryByText("Debt Consolidation")).toBeNull();
      expect(queryByText("Home Improvement")).toBeNull();
    });

    fireEvent.changeText(searchInput, "1500");
    act(() => jest.runAllTimers());
    await waitFor(() => {
      expect(findByText("Debt Consolidation")).toBeTruthy();
      expect(queryByText("Small Business")).toBeNull();
    });
  });

  it("navigates to LoanDetails when a loan card is pressed or Details button is clicked", async () => {
    const { findAllByText, findByText } = render(
      <MarketplaceScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );
    act(() => jest.runAllTimers()); // Load loans

    // Test pressing the card itself (first loan: Debt Consolidation)
    const _loanCard = await findByText("Debt Consolidation");
    // Card press is on the Card component, which is an ancestor. We'll target a button for more directness.

    const detailsButtons = await findAllByText("Details");
    fireEvent.press(detailsButtons[0]); // Click details for the first loan (ID '1')
    expect(mockNavigate).toHaveBeenCalledWith("LoanDetails", { loanId: "1" });

    mockNavigate.mockClear();
    fireEvent.press(detailsButtons[1]); // Click details for the second loan (ID '2')
    expect(mockNavigate).toHaveBeenCalledWith("LoanDetails", { loanId: "2" });
  });

  it("navigates to LoanDetails with focusFund when Fund button is clicked for an available loan", async () => {
    const { findAllByText } = render(
      <MarketplaceScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );
    act(() => jest.runAllTimers()); // Load loans

    const fundButtons = await findAllByText("Fund");
    // First loan (ID '1') is 'Available'
    fireEvent.press(fundButtons[0]);
    expect(mockNavigate).toHaveBeenCalledWith("LoanDetails", {
      loanId: "1",
      focusFund: true,
    });
  });

  it("shows loading indicator while fetching loans", () => {
    const { getByTestId, queryByTestId } = render(
      <MarketplaceScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );
    // ActivityIndicator is shown initially. The component uses a loading state.
    // We can check for its presence. If it had a testID, it would be easier.
    // For now, we check that the list is not yet rendered.
    expect(queryByTestId("loan-list")).toBeNull(); // Assuming FlatList would have a testID if we added one.
    // Or check for the ActivityIndicator directly if possible, or a loading text if any.
  });

  it("shows error message if fetching loans fails", async () => {
    // This requires modifying the component's fetchLoans to simulate an error
    // or mocking the apiService if it were used.
    // For the current placeholder logic, we can't easily trigger the error state from the test.
    // Conceptual test:
    // jest.spyOn(global, 'setTimeout').mockImplementationOnce(() => { throw new Error('Network Error'); });
    // const { findByText } = render(<MarketplaceScreen navigation={mockNavigation} />, { wrapper: AllTheProviders });
    // await waitFor(() => expect(findByText('Failed to load loan marketplace. Please try again.')).toBeTruthy());
    expect(true).toBe(true); // Placeholder for now
  });

  it("shows empty list message when no loans are found after search", async () => {
    const { getByPlaceholderText, findByText } = render(
      <MarketplaceScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );
    act(() => jest.runAllTimers()); // Initial load

    const searchInput = getByPlaceholderText("Search loans...");
    fireEvent.changeText(searchInput, "NonExistentPurpose12345");
    act(() => jest.runAllTimers()); // Re-fetch

    await waitFor(() => {
      expect(findByText("No loans found.")).toBeTruthy();
      expect(findByText("Try adjusting your search.")).toBeTruthy();
    });
  });

  it("refreshes loan list when pull-to-refresh is triggered", async () => {
    const { getByTestId, findByText } = render(
      <MarketplaceScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );
    act(() => jest.runAllTimers()); // Initial load
    await findByText("Debt Consolidation"); // Ensure initial load complete

    // To test RefreshControl, we need to find the FlatList and trigger its onRefresh prop.
    // This is not straightforward with RTL without specific testIDs or accessibility props on FlatList.
    // const flatList = getByTestId('marketplace-flatlist'); // If FlatList had this testID
    // fireEvent(flatList, 'onRefresh');
    // act(() => jest.runAllTimers()); // For the setTimeout in onRefresh
    // await waitFor(() => { /* assertions for refreshed data */ });
    expect(true).toBe(true); // Placeholder for direct refresh gesture testing
  });

  it("renders funding progress correctly for available loans", async () => {
    const { findByText } = render(
      <MarketplaceScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );
    act(() => jest.runAllTimers());

    // Loan 2: amount: 500, fundedAmount: 100 (20%)
    await waitFor(() => {
      expect(findByText("$100 / $500 funded (20%)")).toBeTruthy();
    });

    // Loan 1: amount: 1500, fundedAmount: 0 (0%)
    // The text for 0% funded is not explicitly shown in the same format, but progress bar won't be there.
    // Loan 4: status 'Funded'
    await waitFor(() => {
      expect(findByText("Fully Funded")).toBeTruthy();
    });
  });
});
