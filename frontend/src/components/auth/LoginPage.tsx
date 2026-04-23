import type { ReactNode } from "react";
import { Route, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAuthStore } from "@/store/authStore";

type AccessCardProps = {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
};

const AccessCard = ({ icon, title, description, onClick }: AccessCardProps): JSX.Element => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[206px] w-full flex-col items-center justify-center rounded-[18px] border border-emerald-500/75 bg-slate-800/85 px-6 py-8 text-center shadow-[0_18px_60px_-32px_rgba(16,185,129,0.45)] transition duration-200 hover:-translate-y-0.5 hover:border-emerald-400 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#020817]"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_10px_30px_-18px_rgba(16,185,129,0.7)]">
        {icon}
      </div>
      <h2 className="mt-6 text-[2rem] font-medium leading-none text-slate-50">{title}</h2>
      <p className="mt-4 max-w-[17rem] text-lg leading-8 text-slate-400">{description}</p>
    </button>
  );
};

export const LoginPage = (): JSX.Element => {
  const navigate = useNavigate();
  const setGuestMode = useAuthStore((state) => state.setGuestMode);

  const handleGuestEntry = (): void => {
    setGuestMode(true);
    navigate("/upload");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#020817] px-6 py-12 text-white">
      <div className="w-full max-w-5xl">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_18px_55px_-28px_rgba(16,185,129,0.85)]">
            <Route size={30} strokeWidth={2.1} aria-hidden="true" />
          </div>

          <h1 className="mt-8 text-4xl font-medium tracking-[-0.03em] text-slate-50 md:text-[3.25rem]">
            AI-Driven Road Assessment Platform
          </h1>
          <p className="mt-4 text-lg text-slate-400 md:text-xl">
            Analyze satellite imagery to assess road conditions
          </p>

          <div className="mt-12 grid w-full max-w-[880px] gap-6 md:grid-cols-2">
            <AccessCard
              icon={<UserRound size={28} strokeWidth={2.1} aria-hidden="true" />}
              title="Guest Mode"
              description="Upload and analyze images without an account"
              onClick={handleGuestEntry}
            />
            <AccessCard
              icon={<Route size={28} strokeWidth={2.1} aria-hidden="true" />}
              title="Admin Login"
              description="Access full platform features and admin panel"
              onClick={() => navigate("/login/admin")}
            />
          </div>

          <p className="mt-10 text-sm text-slate-500 md:text-base">
            Note: This is a prototype. No authentication required.
          </p>
        </div>
      </div>
    </div>
  );
};
