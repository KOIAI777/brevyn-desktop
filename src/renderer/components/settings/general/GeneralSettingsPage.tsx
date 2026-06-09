import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import { Camera, ImagePlus, Languages } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { ReadOnlyField } from "@/components/settings/shared/SettingsControls";
import { errorMessage } from "@/components/settings/shared/settingsErrors";
import { cx } from "@/lib/cn";
import { profileDisplayName, UserAvatar } from "@/lib/user-profile";
import type { UserProfileSettings } from "@/types/domain";

interface EmojiMartEmoji {
  native: string;
}

export function GeneralSettingsPage({
  profile,
  onProfileChange,
}: {
  profile: UserProfileSettings;
  onProfileChange: (profile: UserProfileSettings) => void;
}) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(profileDisplayName(profile));
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [statusLine, setStatusLine] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNameInput(profileDisplayName(profile));
    setStatusLine("");
  }, [profile]);

  async function updateProfile(patch: Partial<UserProfileSettings>) {
    try {
      const nextProfile = await window.brevyn.app.updateProfile(patch);
      onProfileChange(nextProfile);
      setStatusLine("个人信息已保存。");
      return true;
    } catch (error) {
      setStatusLine(errorMessage(error, "保存个人信息失败。"));
      return false;
    }
  }

  async function updateAvatar(avatarId: string) {
    const saved = await updateProfile({ avatarId });
    if (saved) setShowEmojiPicker(false);
  }

  async function saveName() {
    const displayName = nameInput.trim();
    if (!displayName) {
      setStatusLine("昵称不能为空。");
      return;
    }
    const saved = await updateProfile({ displayName });
    if (saved) setIsEditingName(false);
  }

  function handleNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") void saveName();
    if (event.key === "Escape") {
      setNameInput(profileDisplayName(profile));
      setIsEditingName(false);
    }
  }

  function handleImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") void updateAvatar(reader.result);
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  return (
    <div className="space-y-5">
      <section className="brevyn-panel-surface p-4">
        <div className="mb-4">
          <div className="text-sm font-semibold text-foreground">用户档案</div>
          <div className="mt-1 text-[11px] leading-5 text-muted-foreground">设置你的头像和显示名称。</div>
        </div>

        <div className="brevyn-card-surface flex items-center gap-5 bg-background px-4 py-4">
          <div className="relative">
            <button
              type="button"
              className="group/avatar relative block rounded-[20%] outline-none"
              onClick={() => setShowEmojiPicker((visible) => !visible)}
              title="更换头像"
            >
              <UserAvatar profile={profile} size="lg" />
              <span className="absolute inset-0 flex items-center justify-center rounded-[20%] bg-black/40 opacity-0 transition-opacity group-hover/avatar:opacity-100">
                <Camera className="h-5 w-5 text-white" />
              </span>
            </button>

            {showEmojiPicker && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-10 cursor-default"
                  aria-label="关闭头像选择"
                  onClick={() => setShowEmojiPicker(false)}
                />
                <div className="absolute left-[calc(100%+12px)] top-0 z-20 overflow-hidden rounded-[var(--radius-panel)] bg-card shadow-2xl ring-1 ring-black/[0.08]">
                  <Picker
                    data={data}
                    onEmojiSelect={(emoji: EmojiMartEmoji) => void updateAvatar(emoji.native)}
                    locale="zh"
                    theme="auto"
                    previewPosition="none"
                    skinTonePosition="search"
                    perLine={8}
                  />
                  <div className="border-t border-border/45 px-3 py-2">
                    <button
                      type="button"
                      className="flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-control)] px-3 py-2 text-[13px] font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground active:scale-[0.98]"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImagePlus className="h-4 w-4" />
                      上传自定义图片
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="min-w-0 flex-1">
            {isEditingName ? (
              <input
                type="text"
                value={nameInput}
                onChange={(event) => setNameInput(event.target.value)}
                onBlur={() => void saveName()}
                onKeyDown={handleNameKeyDown}
                maxLength={40}
                autoFocus
                className="w-full max-w-[240px] border-b-2 border-primary bg-transparent pb-0.5 text-lg font-semibold text-foreground outline-none"
              />
            ) : (
              <button
                type="button"
                className="block truncate text-left text-lg font-semibold text-foreground transition hover:text-primary"
                onClick={() => {
                  setNameInput(profileDisplayName(profile));
                  setIsEditingName(true);
                }}
              >
                {profileDisplayName(profile)}
              </button>
            )}
            <div className="mt-0.5 text-[12px] text-muted-foreground/70">点击头像更换，点击名字编辑</div>
          </div>
        </div>

        {statusLine && (
          <div className={cx("mt-3 text-[11px] font-medium", statusLine.includes("失败") || statusLine.includes("不能为空") ? "text-destructive" : "text-emerald-700")}>
            {statusLine}
          </div>
        )}
      </section>

      <section className="brevyn-panel-surface p-4">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-card)] bg-primary/10 text-primary">
            <Languages className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">通用设置</div>
            <div className="mt-1 text-[11px] leading-5 text-muted-foreground">先放全局偏好入口，后面语言、外观和行为设置都可以收在这里。</div>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <ReadOnlyField label="语言" value="中文" />
          <ReadOnlyField label="状态" value="占位，暂不切换界面语言" />
        </div>
      </section>
    </div>
  );
}
