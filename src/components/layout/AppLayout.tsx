import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import AppSidebar from './AppSidebar';
import TopBar from './TopBar';

const AppLayout = () => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="relative flex h-screen overflow-hidden bg-background font-body selection:bg-gold/20">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-[10%] h-64 w-64 rounded-full bg-gold/10 blur-3xl" />
        <div className="absolute bottom-0 right-[12%] h-80 w-80 rounded-full bg-gold/10 blur-3xl" />
      </div>
      <AppSidebar collapsed={collapsed} />
      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        <TopBar onToggleSidebar={() => setCollapsed(!collapsed)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
          <div className="max-w-[1700px] mx-auto app-surface p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
