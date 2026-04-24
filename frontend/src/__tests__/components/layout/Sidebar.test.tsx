import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { Sidebar } from "@/components/layout/Sidebar";
import { useAuthStore } from "@/store/authStore";

jest.mock("@/store/authStore", () => ({
  useAuthStore: jest.fn(),
}));

const useAuthStoreMock = useAuthStore as unknown as jest.Mock;

const defaultStore = {
  guestMode: false,
  signOut: jest.fn(async () => undefined),
  setGuestMode: jest.fn(),
};

describe("Sidebar", () => {
  beforeEach(() => {
    useAuthStoreMock.mockImplementation((selector: (s: typeof defaultStore) => unknown) =>
      selector(defaultStore),
    );
  });

  const renderSidebar = (pathname: string, isAdmin = false) => {
    return render(
      <MemoryRouter initialEntries={[pathname]}>
        <Sidebar isAdmin={isAdmin} />
      </MemoryRouter>,
    );
  };

  it("renders all main navigation items", () => {
    renderSidebar("/dashboard");
    expect(screen.getByRole("button", { name: /Dashboard/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Projects/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Map Analysis/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Processing/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reports/ })).toBeInTheDocument();
  });

  it("shows the Admin Panel link for admin users", () => {
    renderSidebar("/dashboard", true);
    expect(screen.getByRole("button", { name: /Admin Panel/ })).toBeInTheDocument();
  });

  it("hides the Admin Panel link for non-admin users", () => {
    renderSidebar("/dashboard", false);
    expect(screen.queryByRole("button", { name: /Admin Panel/ })).not.toBeInTheDocument();
  });

  it("highlights the active route", () => {
    renderSidebar("/projects");
    const projectsBtn = screen.getByRole("button", { name: /Projects/ });
    expect(projectsBtn.className).toContain("active");
  });

  it("shows the brand name", () => {
    renderSidebar("/dashboard");
    expect(screen.getByText("Roadlytics")).toBeInTheDocument();
  });
});
