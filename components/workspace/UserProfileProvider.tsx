"use client";

import {createContext,useContext,useMemo} from "react";

export type WorkspaceProfile={id:string;email:string;username:string|null;displayName:string|null;avatarUrl:string|null};
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
