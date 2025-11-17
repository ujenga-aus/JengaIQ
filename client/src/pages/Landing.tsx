import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, FileCheck, MessageSquare, AlertTriangle } from "lucide-react";
import backgroundVideo from "@assets/istockphoto-1479236451-640_adpp_is_1760494235132.mp4";
import logoImage from "@assets/uJenga Logo - Tagline - Orange_1762754244402.png";

export default function Landing() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden">
      {/* Video Background */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      >
        <source src={backgroundVideo} type="video/mp4" />
      </video>
      
      {/* Dark Overlay (30% opacity) */}
      <div className="absolute inset-0 bg-black/30" />
      
      {/* Gradient overlay for better text readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/50" />
      
      {/* Content - positioned above video */}
      <div className="relative z-10 max-w-6xl w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <div className="flex justify-center">
            <img 
              src={logoImage} 
              alt="uJenga" 
              className="h-24 md:h-32 object-contain drop-shadow-2xl"
            />
          </div>
          <p className="text-xl text-white/90 max-w-2xl mx-auto drop-shadow-md">
            Comprehensive construction commercial management with AI-Powered leverage
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-200">
          <Card className="bg-white/10 backdrop-blur-md border-white/20 hover-elevate transition-all duration-300">
            <CardHeader>
              <Building2 className="h-8 w-8 mb-2 text-white" />
              <CardTitle className="text-white">Multi-Tenant</CardTitle>
              <CardDescription className="text-white/80">
                Company-based organization with business units and projects
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-white/10 backdrop-blur-md border-white/20 hover-elevate transition-all duration-300">
            <CardHeader>
              <Users className="h-8 w-8 mb-2 text-white" />
              <CardTitle className="text-white">Role-Based Access</CardTitle>
              <CardDescription className="text-white/80">
                Granular permissions and project-specific roles
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-white/10 backdrop-blur-md border-white/20 hover-elevate transition-all duration-300">
            <CardHeader>
              <FileCheck className="h-8 w-8 mb-2 text-white" />
              <CardTitle className="text-white">Contract Management</CardTitle>
              <CardDescription className="text-white/80">
                AI powered contract benchmarking. Generate Notice templates & Flowcharts. Field administration of Notices and events
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-white/10 backdrop-blur-md border-white/20 hover-elevate transition-all duration-300">
            <CardHeader>
              <MessageSquare className="h-8 w-8 mb-2 text-white" />
              <CardTitle className="text-white">RFI Management</CardTitle>
              <CardDescription className="text-white/80">
                Track requests for information with threading
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-white/10 backdrop-blur-md border-white/20 hover-elevate transition-all duration-300">
            <CardHeader>
              <AlertTriangle className="h-8 w-8 mb-2 text-white" />
              <CardTitle className="text-white">Risk Management</CardTitle>
              <CardDescription className="text-white/80">
                Generate R&O registers using AI and Monte Carlo modelling
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* CTA */}
        <Card className="max-w-md mx-auto bg-white/95 backdrop-blur-md border-white/30 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
          <CardHeader>
            <CardTitle>Get Started</CardTitle>
            <CardDescription>
              Sign in with your Replit account to access the platform
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={handleLogin} 
              className="w-full" 
              size="lg"
              data-testid="button-login"
            >
              Log In
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
