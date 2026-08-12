"use client"

import React, { useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from "@/components/ui/command"
import {
  LayoutDashboard,
  PlusCircle,
  Radio,
  History,
  FileText,
  MessageSquareReply,
  GraduationCap,
  Settings,
  HelpCircle,
  Search,
  FileCode,
} from "lucide-react"

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter()

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [open, onOpenChange])

  const runCommand = (action: () => void) => {
    onOpenChange(false)
    action()
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <div className="bg-black border border-[#333] font-mono text-xs text-white">
        <div className="flex items-center border-b border-[#262626] px-3 py-2 bg-[#080808]">
          <Search className="w-4 h-4 mr-2 text-zinc-500 shrink-0" />
          <CommandInput
            placeholder="Type a command or search pages, claims, sources..."
            className="bg-transparent border-none text-xs text-white placeholder:text-zinc-600 focus:outline-none w-full font-mono"
          />
          <kbd className="text-[10px] text-zinc-500 border border-[#333] px-1 py-0.5 bg-black">
            ESC
          </kbd>
        </div>

        <CommandList className="max-h-80 overflow-y-auto p-2">
          <CommandEmpty className="py-6 text-center text-xs text-zinc-500 font-mono">
            [!] No matching debate records or commands found.
          </CommandEmpty>

          <CommandGroup
            heading="MAIN NAVIGATION"
            className="text-[10px] text-zinc-500 uppercase tracking-widest px-2 py-1 font-semibold"
          >
            <CommandItem
              onSelect={() => runCommand(() => router.push("/dashboard"))}
              className="flex items-center justify-between px-3 py-2 text-xs text-zinc-300 hover:bg-[#141414] hover:text-white cursor-pointer font-mono border border-transparent hover:border-[#262626] my-0.5"
            >
              <div className="flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4 text-zinc-400" />
                <span>Dashboard Overview</span>
              </div>
              <CommandShortcut className="text-[10px] text-zinc-600">G D</CommandShortcut>
            </CommandItem>

            <CommandItem
              onSelect={() => runCommand(() => router.push("/live-debate"))}
              className="flex items-center justify-between px-3 py-2 text-xs text-zinc-300 hover:bg-[#141414] hover:text-white cursor-pointer font-mono border border-transparent hover:border-[#262626] my-0.5"
            >
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                <span>Live Debate Session</span>
              </div>
              <CommandShortcut className="text-[10px] text-emerald-400 border border-emerald-950 px-1">
                LIVE
              </CommandShortcut>
            </CommandItem>

            <CommandItem
              onSelect={() => runCommand(() => router.push("/new-analysis"))}
              className="flex items-center justify-between px-3 py-2 text-xs text-zinc-300 hover:bg-[#141414] hover:text-white cursor-pointer font-mono border border-transparent hover:border-[#262626] my-0.5"
            >
              <div className="flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-zinc-400" />
                <span>Start New Analysis</span>
              </div>
              <CommandShortcut className="text-[10px] text-zinc-600">G N</CommandShortcut>
            </CommandItem>

            <CommandItem
              onSelect={() => runCommand(() => router.push("/history"))}
              className="flex items-center justify-between px-3 py-2 text-xs text-zinc-300 hover:bg-[#141414] hover:text-white cursor-pointer font-mono border border-transparent hover:border-[#262626] my-0.5"
            >
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-zinc-400" />
                <span>Choose an Analysis Workspace</span>
              </div>
              <CommandShortcut className="text-[10px] text-zinc-600">G W</CommandShortcut>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator className="bg-[#262626] my-2" />

          <CommandGroup
            heading="EXPLORE & DEEP DIVE"
            className="text-[10px] text-zinc-500 uppercase tracking-widest px-2 py-1 font-semibold"
          >
            <CommandItem
              onSelect={() => runCommand(() => router.push("/history"))}
              className="flex items-center justify-between px-3 py-2 text-xs text-zinc-300 hover:bg-[#141414] hover:text-white cursor-pointer font-mono border border-transparent hover:border-[#262626] my-0.5"
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-zinc-400" />
                <span>Choose an Analysis Report</span>
              </div>
            </CommandItem>

            <CommandItem
              onSelect={() => runCommand(() => router.push("/history"))}
              className="flex items-center justify-between px-3 py-2 text-xs text-zinc-300 hover:bg-[#141414] hover:text-white cursor-pointer font-mono border border-transparent hover:border-[#262626] my-0.5"
            >
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-zinc-400" />
                <span>Debate History Archive</span>
              </div>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator className="bg-[#262626] my-2" />

          <CommandGroup
            heading="SETTINGS & HELP"
            className="text-[10px] text-zinc-500 uppercase tracking-widest px-2 py-1 font-semibold"
          >
            <CommandItem
              onSelect={() => runCommand(() => router.push("/settings"))}
              className="flex items-center justify-between px-3 py-2 text-xs text-zinc-300 hover:bg-[#141414] hover:text-white cursor-pointer font-mono border border-transparent hover:border-[#262626] my-0.5"
            >
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-zinc-400" />
                <span>Platform Preferences & API Keys</span>
              </div>
            </CommandItem>

            <CommandItem
              onSelect={() => runCommand(() => router.push("/help"))}
              className="flex items-center justify-between px-3 py-2 text-xs text-zinc-300 hover:bg-[#141414] hover:text-white cursor-pointer font-mono border border-transparent hover:border-[#262626] my-0.5"
            >
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-zinc-400" />
                <span>Help Documentation & Shortcuts</span>
              </div>
            </CommandItem>
          </CommandGroup>
        </CommandList>

        <div className="p-2 border-t border-[#262626] bg-[#050505] flex items-center justify-between text-[10px] text-zinc-500 font-mono">
          <span>Navigate with ↑ ↓ keys</span>
          <span>Press Enter to select</span>
        </div>
      </div>
    </CommandDialog>
  )
}
