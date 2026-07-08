import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth, useUser } from "@clerk/clerk-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../../convex/_generated/dataModel";
import { isDemo } from "./demoMode";

type SessionUser = FunctionReturnType<typeof api.users.list>[number];

type SessionValue = {
  users: SessionUser[];
  currentUser: SessionUser | undefined;
  currentUserId: Id<"users"> | undefined;
  setCurrentUserId: (id: Id<"users">) => void;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  if (isDemo) {
    return <DemoSessionProvider>{children}</DemoSessionProvider>;
  }

  return <ProductSessionProvider>{children}</ProductSessionProvider>;
}

function DemoSessionProvider({ children }: { children: ReactNode }) {
  const users = useQuery(api.users.list);
  const [currentUserId, setCurrentUserIdState] = useState<
    Id<"users"> | undefined
  >();

  useEffect(() => {
    if (!users || users.length === 0) return;
    const valid = currentUserId && users.some((u) => u._id === currentUserId);
    if (!valid) {
      const firstHuman = users.find((u) => !u.isAgent) ?? users[0];
      setCurrentUserIdState(firstHuman._id);
    }
  }, [users, currentUserId]);

  const value = useMemo<SessionValue>(() => {
    const currentUser = users?.find((u) => u._id === currentUserId);
    return {
      users: users ?? [],
      currentUser,
      currentUserId: currentUser?._id,
      setCurrentUserId: setCurrentUserIdState,
    };
  }, [users, currentUserId]);

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

function ProductSessionProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const users = useQuery(api.users.list);
  const viewer = useQuery(api.users.viewer);
  const ensureViewer = useMutation(api.users.ensureViewer);
  const syncViewerProfile = useMutation(api.users.syncViewerProfile);
  const ensureRequested = useRef(false);
  const syncedProfileName = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      ensureRequested.current = false;
      return;
    }
    if (viewer !== null || ensureRequested.current) return;
    ensureRequested.current = true;
    void ensureViewer().catch((error) => {
      ensureRequested.current = false;
      console.error("Failed to ensure viewer", error);
    });
  }, [ensureViewer, isLoaded, isSignedIn, viewer]);

  const authDisplayName = useMemo(() => {
    const email = user?.primaryEmailAddress?.emailAddress;
    return (
      user?.fullName?.trim() ||
      user?.username?.trim() ||
      (email ? email.split("@")[0] : undefined)
    );
  }, [user]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !viewer || !authDisplayName) return;
    if (viewer.name !== "member" && viewer.initials !== "ME") return;
    if (syncedProfileName.current === authDisplayName) return;

    syncedProfileName.current = authDisplayName;
    void syncViewerProfile({ name: authDisplayName }).catch((error) => {
      syncedProfileName.current = null;
      console.error("Failed to sync viewer profile", error);
    });
  }, [authDisplayName, isLoaded, isSignedIn, syncViewerProfile, viewer]);

  const value = useMemo<SessionValue>(() => {
    const currentUser = viewer ?? undefined;
    return {
      users: users ?? (viewer ? [viewer] : []),
      currentUser,
      currentUserId: currentUser?._id,
      setCurrentUserId: () => {},
    };
  }, [users, viewer]);

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
