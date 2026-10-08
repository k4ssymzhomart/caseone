// «Вернуть на доработку»: the comment is required (CLAUDE.md §6 return).
import { useState } from 'react';

import { t } from '@/lib/i18n';
import { Button } from '@/ui/Button';
import { TextArea } from '@/ui/TextArea';

import { SheetModal } from './SheetModal';

export interface ReturnSheetProps {
  onClose: () => void;
  onSubmit: (comment: string) => void;
}

/** Mount it only while open. */
export function ReturnSheet({ onClose, onSubmit }: ReturnSheetProps) {
  const [comment, setComment] = useState('');
  const [tried, setTried] = useState(false);
  const text = comment.trim();

  return (
    <SheetModal
      visible
      onClose={onClose}
      title={t('action.return')}
      footer={
        <Button
          label={t('action.return')}
          variant="danger"
          size="L"
          full
          disabled={tried && !text}
          onPress={() => {
            setTried(true);
            if (text) onSubmit(text);
          }}
        />
      }
    >
      <TextArea
        label={t('review.return.label')}
        placeholder={t('review.return.placeholder')}
        value={comment}
        onChangeText={setComment}
        autoFocus
        {...(tried && !text ? { error: t('review.return.required') } : {})}
      />
    </SheetModal>
  );
}
