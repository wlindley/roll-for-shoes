import type React from 'react';
import { characterInitials } from '../portrait-image';

export interface CharacterAvatarProps {
  readonly name: string;
  readonly portrait?: string | null;
  readonly alt?: string;
}

export function CharacterAvatar({ name, portrait, alt }: CharacterAvatarProps): React.JSX.Element {
  return portrait ? (
    <img src={portrait} alt={alt ?? `${name} portrait`} width={64} height={64} className="character-avatar" />
  ) : (
    <div className="character-avatar character-avatar-fallback" aria-hidden="true">{characterInitials(name) || '?'}</div>
  );
}
