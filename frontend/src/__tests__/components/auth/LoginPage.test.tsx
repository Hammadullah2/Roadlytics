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
    useAuthStoreMock.mockImplementation((selector) => selector({ setGuestMode }));
  });

  const renderLoginPage = () => {
    return render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/upload" element={<div>upload-page</div>} />
          <Route path="/login/admin" element={<div>admin-login-page</div>} />
        </Routes>
      </MemoryRouter>,
    );
  };

  it("renders the entry screen layout and copy", () => {
    renderLoginPage();

    expect(screen.getByRole("heading", { name: "AI-Driven Road Assessment Platform" })).toBeInTheDocument();
    expect(screen.getByText("Analyze satellite imagery to assess road conditions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Guest Mode/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Admin Login/i })).toBeInTheDocument();
    expect(screen.getByText("Note: This is a prototype. No authentication required.")).toBeInTheDocument();
  });

  it("enters guest mode and navigates to upload", async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.click(screen.getByRole("button", { name: /Guest Mode/i }));

    expect(setGuestMode).toHaveBeenCalledWith(true);
    expect(screen.getByText("upload-page")).toBeInTheDocument();
  });

  it("opens the admin login screen from the entry card", async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.click(screen.getByRole("button", { name: /Admin Login/i }));

    expect(screen.getByText("admin-login-page")).toBeInTheDocument();
  });
});
