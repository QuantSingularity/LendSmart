import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import Register from "../../pages/Register";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

jest.mock("../../contexts/ApiContext", () => ({
  useApi: jest.fn(),
}));

import { useApi } from "../../contexts/ApiContext";

const renderRegister = () =>
  render(
    <BrowserRouter>
      <Register />
    </BrowserRouter>,
  );

const fillForm = ({ confirmPassword = "Password1!", consents = true } = {}) => {
  fireEvent.change(screen.getByLabelText(/^Username/i), {
    target: { value: "test_user" },
  });
  fireEvent.change(screen.getByLabelText(/^First Name/i), {
    target: { value: "Test" },
  });
  fireEvent.change(screen.getByLabelText(/^Last Name/i), {
    target: { value: "User" },
  });
  fireEvent.change(screen.getByLabelText(/^Email Address/i), {
    target: { value: "test@test.com" },
  });
  fireEvent.change(screen.getByLabelText(/^Phone Number/i), {
    target: { value: "+15551234567" },
  });
  fireEvent.change(screen.getByLabelText(/^Date of Birth/i), {
    target: { value: "1990-01-01" },
  });
  fireEvent.mouseDown(screen.getByRole("combobox"));
  fireEvent.click(within(screen.getByRole("listbox")).getByText("Full-time"));
  fireEvent.change(screen.getByLabelText(/^Password/i), {
    target: { value: "Password1!" },
  });
  fireEvent.change(screen.getByLabelText(/^Confirm Password/i), {
    target: { value: confirmPassword },
  });
  if (consents) {
    fireEvent.click(screen.getByLabelText(/Terms of Service/i));
    fireEvent.click(screen.getByLabelText(/credit checks/i));
  }
};

describe("Register Page", () => {
  const mockRegister = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useApi.mockReturnValue({
      register: mockRegister,
      loading: false,
      error: null,
    });
  });

  test("renders registration form", () => {
    renderRegister();

    expect(
      screen.getByRole("heading", { name: /Sign up/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^First Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Last Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Phone Number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Date of Birth/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Confirm Password/i)).toBeInTheDocument();
  });

  test("handles successful registration", async () => {
    mockRegister.mockResolvedValueOnce({ user: {}, token: "token" });

    renderRegister();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: /Sign Up/i }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith({
        username: "test_user",
        email: "test@test.com",
        password: "Password1!",
        firstName: "Test",
        lastName: "User",
        phoneNumber: "+15551234567",
        dateOfBirth: "1990-01-01",
        employmentStatus: "full-time",
        consents: {
          essential: true,
          financial_services: true,
          marketing: false,
        },
      });
      expect(mockNavigate).toHaveBeenCalledWith("/login");
    });
  });

  test("displays error when passwords do not match", async () => {
    renderRegister();
    fillForm({ confirmPassword: "different" });
    fireEvent.click(screen.getByRole("button", { name: /Sign Up/i }));

    await waitFor(() => {
      expect(screen.getByText(/Passwords do not match/i)).toBeInTheDocument();
      expect(mockRegister).not.toHaveBeenCalled();
    });
  });

  test("requires the essential consents", async () => {
    renderRegister();
    fillForm({ consents: false });
    fireEvent.click(screen.getByRole("button", { name: /Sign Up/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/You must accept the essential/i),
      ).toBeInTheDocument();
      expect(mockRegister).not.toHaveBeenCalled();
    });
  });

  test("displays error message on registration failure", async () => {
    const errorMessage = "Email already exists";
    mockRegister.mockRejectedValueOnce({
      response: { data: { message: errorMessage } },
    });

    renderRegister();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: /Sign Up/i }));

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  test("renders link to login page", () => {
    renderRegister();

    expect(screen.getByText(/Already have an account/i)).toBeInTheDocument();
  });
});
