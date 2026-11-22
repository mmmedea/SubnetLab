import {redirect} from "next/navigation";
import {createClient} from "@/utils/supabase/server";
import WorkspaceSidebar from "@/components/workspace/WorkspaceSidebar";
import UserProfileProvider from "@/components/workspace/UserProfileProvider";

export default async function WorkspaceLayout({children}:{children:React.ReactNode}){
 const supabase=await createClient();
 const{data:{user},error}=await supabase.auth.getUser();
 if(error||!user)redirect("/login?next=%2Fdashboard");
 const[{data:profile},{data:preferences}]=await Promise.all([supabase.from("profiles").select("username,display_name,bio,avatar_url").eq("id",user.id).maybeSingle(),supabase.from("user_preferences").select("*").eq("user_id",user.id).maybeSingle()]);
 const initialProfile={
  id:user.id,
  email:user.email??"",
  username:profile?.username??(typeof user.user_metadata?.user_name==="string"?user.user_metadata.user_name:null),
  displayName:profile?.display_name??(typeof user.user_metadata?.full_name==="string"?user.user_metadata.full_name:null),
  avatarUrl:profile?.avatar_url??(typeof user.user_metadata?.avatar_url==="string"?user.user_metadata.avatar_url:null),
  bio:profile?.bio??null,
  preferences:{theme:preferences?.theme??"dark",email_notifications:preferences?.email_notifications??true,in_app_notifications:preferences?.in_app_notifications??true,compact_mode:preferences?.compact_mode??false,default_ip_version:preferences?.default_ip_version??"ipv4",monospace_font_size:preferences?.monospace_font_size??14},
  emailConfirmed:Boolean(user.email_confirmed_at),
  identities:user.identities??[]
 };
 return <UserProfileProvider initialProfile={initialProfile}><div className="shell"><WorkspaceSidebar/><main className="workspace-main"><div className="topline"><span>WORKSPACE / NETWORK OPERATIONS</span><span className="session-indicator">{initialProfile.displayName||initialProfile.username||initialProfile.email}</span></div>{children}</main></div></UserProfileProvider>;
}
