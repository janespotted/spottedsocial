import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import { AuthProvider } from "./contexts/AuthContext";
import { CheckInProvider } from "./contexts/CheckInContext";
import { FriendIdCardProvider } from "./contexts/FriendIdCardContext";
import { VenueIdCardProvider } from "./contexts/VenueIdCardContext";
import { MeetUpProvider } from "./contexts/MeetUpContext";
import { VenueInviteProvider } from "./contexts/VenueInviteContext";
import { NotificationsProvider } from "./contexts/NotificationsContext";
import { ImDownProvider } from "./contexts/ImDownContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminRoute } from "./components/AdminRoute";
import { Layout } from "./components/Layout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PageErrorBoundary } from "./components/PageErrorBoundary";
import { FriendIdCard } from "./components/FriendIdCard";
import { VenueIdCard } from "./components/VenueIdCard";
import { MeetUpConfirmation } from "./components/MeetUpConfirmation";
import { InviteFriendsModal } from "./components/InviteFriendsModal";
import { VenueInviteConfirmation } from "./components/VenueInviteConfirmation";
import { ImDownConfirmation } from "./components/ImDownConfirmation";
import { NotificationBanner } from "./components/NotificationBanner";
import { useAuth } from "./contexts/AuthContext";
import { autoTrackVenue } from "./lib/auto-venue-tracker";
import { logger } from "./lib/logger";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import InviteLanding from "./pages/InviteLanding";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import Notifications from "./pages/Notifications";
import Home from "./pages/Home";
import Map from "./pages/Map";
import Leaderboard from "./pages/Leaderboard";
import Feed from "./pages/Feed";
import Messages from "./pages/Messages";
import Thread from "./pages/Thread";
import FriendRequests from "./pages/FriendRequests";
import Profile from "./pages/Profile";
import EditProfile from "./pages/EditProfile";
import CloseFriends from "./pages/CloseFriends";
import DemoSettings from "./pages/DemoSettings";
import Settings from "./pages/Settings";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Component to trigger auto-tracking on app open
function AutoTracker() {
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      logger.debug('app:open', { userId: user.id });
      logger.setUserId(user.id);
      autoTrackVenue(user.id);
    } else {
      logger.setUserId(null);
    }
  }, [user]);

  return null;
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
          <CheckInProvider>
            <FriendIdCardProvider>
              <VenueIdCardProvider>
                <MeetUpProvider>
                  <VenueInviteProvider>
                    <NotificationsProvider>
                      <ImDownProvider>
                        <AutoTracker />
                        <FriendIdCard />
                        <VenueIdCard />
                        <MeetUpConfirmation />
                        <InviteFriendsModal />
                        <VenueInviteConfirmation />
                        <ImDownConfirmation />
                        <NotificationBanner />
                    <Routes>
                  {/* Public routes */}
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/invite/:code" element={<InviteLanding />} />
                  <Route path="/terms" element={<Terms />} />
                  <Route path="/privacy" element={<Privacy />} />
                  
                  {/* Protected routes */}
                  <Route
                    path="/"
                    element={
                      <ProtectedRoute>
                        <Layout>
                          <PageErrorBoundary pageName="Home">
                            <Home />
                          </PageErrorBoundary>
                        </Layout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/map"
                    element={
                      <ProtectedRoute>
                        <Layout>
                          <PageErrorBoundary pageName="Map">
                            <Map />
                          </PageErrorBoundary>
                        </Layout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/leaderboard"
                    element={
                      <ProtectedRoute>
                        <Layout>
                          <PageErrorBoundary pageName="Leaderboard">
                            <Leaderboard />
                          </PageErrorBoundary>
                        </Layout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/feed"
                    element={
                      <ProtectedRoute>
                        <Layout>
                          <PageErrorBoundary pageName="Feed">
                            <Feed />
                          </PageErrorBoundary>
                        </Layout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/messages"
                    element={
                      <ProtectedRoute>
                        <Layout>
                          <PageErrorBoundary pageName="Messages">
                            <Messages />
                          </PageErrorBoundary>
                        </Layout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/messages/:threadId"
                    element={
                      <ProtectedRoute>
                        <Thread />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/friend-requests"
                    element={
                      <ProtectedRoute>
                        <FriendRequests />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/profile"
                    element={
                      <ProtectedRoute>
                        <Layout>
                          <Profile />
                        </Layout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/profile/edit"
                    element={
                      <ProtectedRoute>
                        <EditProfile />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/profile/close-friends"
                    element={
                      <ProtectedRoute>
                        <CloseFriends />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/demo-settings"
                    element={
                      <ProtectedRoute>
                        <DemoSettings />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/settings"
                    element={
                      <ProtectedRoute>
                        <Settings />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/notifications"
                    element={
                      <ProtectedRoute>
                        <Notifications />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin"
                    element={
                      <ProtectedRoute>
                        <AdminRoute>
                          <Admin />
                        </AdminRoute>
                      </ProtectedRoute>
                    }
                  />
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                      </ImDownProvider>
                    </NotificationsProvider>
                  </VenueInviteProvider>
                </MeetUpProvider>
              </VenueIdCardProvider>
            </FriendIdCardProvider>
            </CheckInProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
