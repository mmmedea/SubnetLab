import {redirect} from "next/navigation";
import {createClient} from "@/utils/supabase/server";
import WorkspaceSidebar from "@/components/workspace/WorkspaceSidebar";
export default async function WorkspaceLayout({children}:{children:React.ReactNode}){
 const supabase=await createClient();
 const{data:{user},error}=await supabase.auth.getUser();
 if(error||!user)redirect("/login?next=%2Fdashboard");
 return <div className="shell"><WorkspaceSidebar/><main className="workspace-main"><div className="topline"><span>WORKSPACE / NETWORK OPERATIONS</span><span className="session-indicator">SIGNED IN</span></div>{children}</main></div>;
}
