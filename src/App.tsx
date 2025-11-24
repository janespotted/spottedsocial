import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { CheckInProvider } from "./contexts/CheckInContext";
import { FriendIdCardProvider } from "./contexts/FriendIdCardContext";
import { VenueIdCardProvider } from "./contexts/VenueIdCardContext";
import { MeetUpProvider } from "./contexts/MeetUpContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { FriendIdCard } from "./components/FriendIdCard";
import { VenueIdCard } from "./components/VenueIdCard";
import { MeetUpConfirmation } from "./components/MeetUpConfirmation";
import Auth from "./pages/Auth";
import Home from "./pages/Home";
import Map from "./pages/Map";
import Leaderboard from "./pages/Leaderboard";
import Feed from "./pages/Feed";
import Messages from "./pages/Messages";
import Thread from "./pages/Thread";
import FriendRequests from "./pages/FriendRequests";
import Profile from "./pages/Profile";
import EditProfile from "./pages/EditProfile";
import DemoSettings from "./pages/DemoSettings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
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
                  <FriendIdCard />
                  <VenueIdCard />
                  <MeetUpConfirmation />
                  <Routes>
                  <Route path="/auth" element={<Auth />} />
                  <Route
                    path="/"
                    element={
                      <ProtectedRoute>
                        <Layout>
                          <Home />
                        </Layout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/map"
                    element={
                      <ProtectedRoute>
                        <Layout>
                          <Map />
                        </Layout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/leaderboard"
                    element={
                      <ProtectedRoute>
                        <Layout>
                          <Leaderboard />
                        </Layout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/feed"
                    element={
                      <ProtectedRoute>
                        <Layout>
                          <Feed />
                        </Layout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/messages"
                    element={
                      <ProtectedRoute>
                        <Layout>
                          <Messages />
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
                    path="/demo-settings"
                    element={
                      <ProtectedRoute>
                        <DemoSettings />
                      </ProtectedRoute>
                    }
                  />
                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </MeetUpProvider>
              </VenueIdCardProvider>
            </FriendIdCardProvider>
          </CheckInProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
