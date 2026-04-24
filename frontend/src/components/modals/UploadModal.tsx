import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ModalController } from "@/controllers/ModalController";
import { UploadFormState } from "@/models/UploadFormState";
import { ModalBackdrop } from "@/components/modals/ModalBackdrop";
import { ModalHeader } from "@/components/modals/ModalHeader";
import { UploadMethodSelector } from "@/components/modals/UploadMethodSelector";
import { FileDropZone } from "@/components/modals/FileDropZone";
import { DateRangeFields } from "@/components/modals/DateRangeFields";
import { SubmitButton } from "@/components/modals/SubmitButton";
import { readSatelliteUploadDraft, writeSatelliteUploadDraft } from "@/lib/satelliteUploadDraft";
import { SatelliteUploadService } from "@/services/SatelliteUploadService";

type UploadModalProps = {
  controller: ModalController;
  onClose: () => void;
  onExited: () => void;
  onSuccess: (jobId: string) => void;
  onSelectRegionClick: (formState: UploadFormState) => void;
};

class UploadModalCopy {
  public static readonly title = "Upload Satellite Imagery";
}

class UploadModalAccessibility {
  public static readonly focusableSelectors =
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

  public static trapFocus(
    event: KeyboardEvent,
    container: HTMLDivElement | null,
  ): void {
    if (event.key !== "Tab" || container === null) {
      return;
    }

    const focusableElements = Array.from(
      container.querySelectorAll<HTMLElement>(UploadModalAccessibility.focusableSelectors),
    ).filter((element) => !element.hasAttribute("disabled"));

    if (focusableElements.length === 0) {
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }
}

export const UploadModal = ({
  controller,
  onClose,
  onExited,
  onSuccess,
  onSelectRegionClick,
}: UploadModalProps): JSX.Element | null => {
  const [formState, setFormState] = useState<UploadFormState>(() => {
    return readSatelliteUploadDraft() ?? UploadFormState.createDefault();
  });
  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const container = modalRef.current;
    const initialFocusableElement = container?.querySelector<HTMLElement>("button");
    initialFocusableElement?.focus();

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      UploadModalAccessibility.trapFocus(event, modalRef.current);
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (!controller.isClosing) {
      return;
    }

    closeTimeoutRef.current = window.setTimeout(() => {
      onExited();
    }, ModalController.animationDurationMilliseconds);

    return () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    };
  }, [controller.isClosing, onExited]);

  useEffect(() => {
    writeSatelliteUploadDraft(formState);
  }, [formState]);

  const modalContent = (
    <ModalBackdrop onClick={onClose} isClosing={controller.isClosing}>
      <div
        ref={modalRef}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-satellite-imagery-title"
        className={`z-[51] w-[600px] max-w-[90vw] rounded-[14px] bg-[color:var(--bg-card)] p-8 ${
          controller.isClosing
            ? "animate-[modalScaleOut_150ms_ease-out_forwards]"
            : "animate-[modalScaleIn_150ms_ease-out_forwards]"
        }`}
      >
        <ModalHeader title={UploadModalCopy.title} onClose={onClose} />

        <UploadMethodSelector
          formState={formState}
          onFormStateChange={setFormState}
        />

        {formState.isDownloadMode() ? (
          <DateRangeFields
            formState={formState}
            onFormStateChange={setFormState}
            onSelectRegionClick={() => onSelectRegionClick(formState)}
          />
        ) : (
          <FileDropZone
            formState={formState}
            onFormStateChange={setFormState}
          />
        )}

        <SubmitButton
          disabled={!formState.isValid() || formState.isSubmitting}
          isSubmitting={formState.isSubmitting}
          onClick={async () => {
            const nextState = formState.clone();
            nextState.clearError();
            nextState.setSubmitting(true);
            setFormState(nextState);

            try {
              const result = formState.isDownloadMode()
                ? await SatelliteUploadService.getInstance().submitUpload(formState.toPayload())
                : await SatelliteUploadService.getInstance().submitFileUpload(
                    formState.selectedFile as File,
                  );

              onSuccess(result.jobId);
              onClose();
            } catch (error) {
              const failedState = formState.clone();
              failedState.setSubmitting(false);
              failedState.setError(
                error instanceof Error ? error.message : "Upload request failed",
              );
              setFormState(failedState);
              return;
            }

            const completedState = formState.clone();
            completedState.setSubmitting(false);
            setFormState(completedState);
          }}
        />

        {formState.errorMessage ? (
          <p className="mt-3 text-sm text-red-400">{formState.errorMessage}</p>
        ) : null}
      </div>
    </ModalBackdrop>
  );

  return createPortal(modalContent, document.body);
};
