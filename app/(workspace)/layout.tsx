import {redirect} from "next/navigation";
import {createClient} from "@/utils/supabase/server";
import WorkspaceSidebar from "@/components/workspace/WorkspaceSidebar";
import UserProfileProvider from "@/components/workspace/UserProfileProvider";

export default async function WorkspaceLayout({children}:{children:React.ReactNode}){
 const supabase=await createClient();
 const{data:{user},error}=await supabase.auth.getUser();
 if(error||!user)redirect("/login?next=%2Fdashboard");
 const{data:profile}=await supabase.from("profiles").select("username,display_name").eq("id",user.id).maybeSingle();
 const initialProfile={
  id:user.id,
  email:user.email??"",
  username:profile?.username??(typeof user.user_metadata?.user_name==="string"?user.user_metadata.user_name:null),
  displayName:profile?.display_name??(typeof user.user_metadata?.full_name==="string"?user.user_metadata.full_name:null),
  avatarUrl:typeof user.user_metadata?.avatar_url==="string"?user.user_metadata.avatar_url:null,\n  emailConfirmed:Boolean(user.email_confirmed_at),\n  identities:user.identities??[]
 };
 return <UserProfileProvider initialProfile={initialProfile}><div className="shell"><WorkspaceSidebar/><main className="workspace-main"><div className="topline"><span>WORKSPACE / NETWORK OPERATIONS</span><span className="session-indicator">{initialProfile.displayName||initialProfile.username||initialProfile.email}</span></div>{children}</main></div></UserProfileProvider>;
}
