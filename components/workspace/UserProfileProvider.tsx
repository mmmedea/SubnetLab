"use client";

import {createContext,useContext,useMemo} from "react";

export type WorkspacePreferences={theme:"dark"|"light"|"system";email_notifications:boolean;in_app_notifications:boolean;compact_mode:boolean;default_ip_version:"ipv4"|"ipv6";monospace_font_size:number};
export type WorkspaceProfile={id:string;email:string;username:string|null;displayName:string|null;avatarUrl:string|null;bio:string|null;emailConfirmed?:boolean;identities?:{provider:string}[];preferences:WorkspacePreferences};
const ProfileContext=createContext<WorkspaceProfile|null>(null);

export default function UserProfileProvider({initialProfile,children}:{initialProfile:WorkspaceProfile;children:React.ReactNode}){
 const value=useMemo(()=>initialProfile,[initialProfile]);
 return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useWorkspaceProfile(){
 const profile=useContext(ProfileContext);
 if(!profile)throw new Error("useWorkspaceProfile must be used inside UserProfileProvider");
 return profile;
}
