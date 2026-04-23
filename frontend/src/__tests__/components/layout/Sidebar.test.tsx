/** This test suite verifies sidebar navigation, role-based links, and active-route styling. */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { Sidebar } from "@/components/layout/Sidebar";
import { useAuthStore } from "@/store/authStore";

jest.mock("@/store/authStore", () => ({
  useAuthStore: jest.fn(),
}));

type SidebarUser = {
  role: "admin" | "user";
} | null;

type SidebarStoreState = {
  user: SidebarUser;
  signOut: () => Promise<void>;
};

const useAuthStoreMock = useAuthStore as unknown as jest.Mock;

describe("Sidebar", () => {
  let storeState: SidebarStoreState;

  beforeEach(() => {
    storeState = {
      user: {
        role: "user",
      },
      signOut: jest.fn(async () => undefined),
    };

    useAuthStoreMock.mockImplementation((selector) => selector(storeState));
  });

  const renderSidebar = (pathname: string) => {
    return render(
      <MemoryRouter initialEntries={[pathname]}>
        <Sidebar isOpen onClose={() => undefined} />
      </MemoryRouter>,
    );
  };

  it("renders all navigation items", () => {
    renderSidebar("/dashboard");

    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Projects" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Map Analysis" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Processing" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reports" })).toBeInTheDocument();
  });

  it("shows the Admin Panel link for admin users", () => {
    storeState.user = { role: "admin" };

    renderSidebar("/dashboard");

    expect(screen.getByRole("link", { name: "Admin Panel" })).toBeInTheDocument();
  });

  it("hides the Admin Panel link for regular users", () => {
    storeState.user = { role: "user" };

    renderSidebar("/dashboard");

    expect(screen.queryByRole("link", { name: "Admin Panel" })).not.toBeInTheDocument();
  });

  it("highlights the active route correctly", () => {
    renderSidebar("/projects/project-1");

    expect(screen.getByRole("link", { name: "Projects" })).toHaveClass("bg-[color:var(--accent-green)]");
  });
});
