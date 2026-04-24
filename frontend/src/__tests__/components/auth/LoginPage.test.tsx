import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Mock useAuth to return a static unauthenticated state
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: false, isLoading: false, user: null, session: null, guestMode: false }),
}));

jest.mock("@/store/authStore", () => ({
  useAuthStore: jest.fn(),
}));

import { LoginPage } from "@/components/auth/LoginPage";
import { useAuthStore } from "@/store/authStore";

const useAuthStoreMock = useAuthStore as unknown as jest.Mock;

describe("LoginPage", () => {
  let signIn: jest.Mock;
  let signInWithGoogle: jest.Mock;
  let signOut: jest.Mock;
  let setGuestMode: jest.Mock;

  beforeEach(() => {
    signIn = jest.fn().mockResolvedValue(undefined);
    signInWithGoogle = jest.fn().mockResolvedValue(undefined);
    signOut = jest.fn().mockResolvedValue(undefined);
    setGuestMode = jest.fn();

    useAuthStoreMock.mockImplementation(
      (selector: (s: {
        signIn: jest.Mock; signInWithGoogle: jest.Mock;
        signOut: jest.Mock; setGuestMode: jest.Mock;
      }) => unknown) =>
        selector({ signIn, signInWithGoogle, signOut, setGuestMode }),
    );
  });

  const renderLoginPage = () =>
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<div>dashboard-page</div>} />
        </Routes>
      </MemoryRouter>,
    );

  it("renders the Roadlytics brand and login form", () => {
    renderLoginPage();
    expect(screen.getByRole("heading", { name: "Roadlytics" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Welcome Back" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Log In/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue as Guest/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("guest entry calls setGuestMode and navigates to dashboard", async () => {
    renderLoginPage();
    fireEvent.click(screen.getByRole("button", { name: /Continue as Guest/i }));
    expect(setGuestMode).toHaveBeenCalledWith(true);
    await waitFor(() => {
      expect(screen.getByText("dashboard-page")).toBeInTheDocument();
    });
  });

  it("Log In submits email/password to signIn and navigates to dashboard", async () => {
    renderLoginPage();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "test@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "secret123" } });
    fireEvent.submit(screen.getByRole("button", { name: /Log In/i }).closest("form")!);

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith("test@example.com", "secret123");
    });
    await waitFor(() => {
      expect(screen.getByText("dashboard-page")).toBeInTheDocument();
    });
  });

  it("shows error message when signIn throws", async () => {
    signIn.mockRejectedValue(new Error("Invalid credentials"));
    renderLoginPage();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "bad@test.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "wrong" } });
    fireEvent.submit(screen.getByRole("button", { name: /Log In/i }).closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
    });
  });
});
