import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { LoginPage } from "@/components/auth/LoginPage";
import { useAuthStore } from "@/store/authStore";

jest.mock("@/store/authStore", () => ({
  useAuthStore: jest.fn(),
}));

const useAuthStoreMock = useAuthStore as unknown as jest.Mock;

describe("LoginPage", () => {
  let setGuestMode: jest.Mock;

  beforeEach(() => {
    setGuestMode = jest.fn();
    useAuthStoreMock.mockImplementation((selector: (s: { setGuestMode: jest.Mock }) => unknown) =>
      selector({ setGuestMode }),
    );
  });

  const renderLoginPage = () => {
    return render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<div>dashboard-page</div>} />
          <Route path="/login/admin" element={<div>admin-login-page</div>} />
        </Routes>
      </MemoryRouter>,
    );
  };

  it("renders the Roadlytics brand and login form", () => {
    renderLoginPage();
    expect(screen.getByRole("heading", { name: "Roadlytics" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Welcome Back" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Log In/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continue as Guest/i })).toBeInTheDocument();
  });

  it("guest entry navigates to dashboard", async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.click(screen.getByRole("button", { name: /Continue as Guest/i }));

    expect(setGuestMode).toHaveBeenCalledWith(true);
    expect(screen.getByText("dashboard-page")).toBeInTheDocument();
  });

  it("Log In button navigates to admin login", async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.click(screen.getByRole("button", { name: /Log In/i }));

    expect(screen.getByText("admin-login-page")).toBeInTheDocument();
  });
});
