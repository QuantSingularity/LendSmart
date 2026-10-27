import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import Header from "../../components/layout/Header";

// Mock the contexts
jest.mock("../../contexts/ApiContext", () => ({
  useApi: jest.fn(),
}));

jest.mock("../../contexts/BlockchainContext", () => ({
  useBlockchain: jest.fn(),
}));

import { useApi } from "../../contexts/ApiContext";
import { useBlockchain } from "../../contexts/BlockchainContext";

describe("Header Component", () => {
  beforeEach(() => {
    useApi.mockReturnValue({
      isAuthenticated: false,
      user: null,
      logout: jest.fn(),
    });

    useBlockchain.mockReturnValue({
      isConnected: false,
      account: null,
      connectWallet: jest.fn(),
      disconnectWallet: jest.fn(),
    });
  });

  test("renders header with logo", () => {
    render(
      <BrowserRouter>
        <Header />
      </BrowserRouter>,
    );

    expect(screen.getAllByText(/LENDSMART/i)[0]).toBeInTheDocument();
  });

  test("renders login and register buttons when not authenticated", () => {
    render(
      <BrowserRouter>
        <Header />
      </BrowserRouter>,
    );

    expect(screen.getByText(/Login/i)).toBeInTheDocument();
    expect(screen.getByText(/Register/i)).toBeInTheDocument();
  });

  test("renders connect wallet button", () => {
    render(
      <BrowserRouter>
        <Header />
      </BrowserRouter>,
    );

    expect(screen.getByText(/Connect Wallet/i)).toBeInTheDocument();
  });

  test("displays user menu when authenticated", () => {
    useApi.mockReturnValue({
      isAuthenticated: true,
      user: { firstName: "Test", username: "testuser", email: "test@test.com" },
      logout: jest.fn(),
    });

    render(
      <BrowserRouter>
        <Header />
      </BrowserRouter>,
    );

    const avatar = screen.getByText("T");
    expect(avatar).toBeInTheDocument();
  });

  test("displays connected wallet address", () => {
    useBlockchain.mockReturnValue({
      isConnected: true,
      account: "0x1234567890123456789012345678901234567890",
      connectWallet: jest.fn(),
      disconnectWallet: jest.fn(),
    });

    render(
      <BrowserRouter>
        <Header />
      </BrowserRouter>,
    );

    expect(screen.getByText(/0x1234...7890/i)).toBeInTheDocument();
  });
});
