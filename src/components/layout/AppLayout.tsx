import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import AppSidebar from './AppSidebar';
import TopBar from './TopBar';
import LeadAlertsListener from '@/components/notifications/LeadAlertsListener';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent } from '@/components/ui/sheet';

const AppLayout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const isMobile = useIsMobile();

  const handleToggleSidebar = () => {
    if (isMobile) {
      setMobileSidebarOpen((prev) => !prev);
      return;
    }
    setCollapsed((prev) => !prev);
  };

  return (
    <div className="relative flex h-screen overflow-hidden bg-background font-body selection:bg-gold/20">
      <LeadAlertsListener />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-[10%] h-64 w-64 rounded-full bg-gold/10 blur-3xl" />
        <div className="absolute bottom-0 right-[12%] h-80 w-80 rounded-full bg-gold/10 blur-3xl" />
      </div>
      {isMobile ? (
        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetContent side="left" className="p-0 border-r border-border/40 bg-white/95">
            <AppSidebar mobile onNavigate={() => setMobileSidebarOpen(false)} />
          </SheetContent>
        </Sheet>
      ) : (
        <AppSidebar collapsed={collapsed} />
      )}
      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        <TopBar onToggleSidebar={handleToggleSidebar} isMobile={isMobile} />
        <main className="flex-1 overflow-y-auto p-2 sm:p-4 md:p-8 custom-scrollbar">
          <div className="max-w-[1700px] mx-auto app-surface p-3 sm:p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
