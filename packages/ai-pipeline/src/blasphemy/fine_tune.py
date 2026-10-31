"""
Fine-tune DistilBERT for blasphemy context classification.

3-class: reverent / profane / neutral.
Model: distilbert-base-uncased (66M params).

Usage:
    python -m src.blasphemy.fine_tune --epochs 10 --output ./models/blasphemy-classifier
    python -m src.blasphemy.fine_tune --test-only --model ./models/blasphemy-classifier
"""

from __future__ import annotations

import argparse
import json
import os
import random
from pathlib import Path

import torch
from torch.utils.data import Dataset, DataLoader
from transformers import (
    DistilBertTokenizer,
    DistilBertForSequenceClassification,
    get_linear_schedule_with_warmup,
)

from .generate_training_data import get_all_expanded_data
from .training_data import TrainingExample

LABELS = ["reverent", "neutral", "profane"]
LABEL_TO_ID = {label: i for i, label in enumerate(LABELS)}
ID_TO_LABEL = {i: label for i, label in enumerate(LABELS)}
MODEL_NAME = "distilbert-base-uncased"


class BlasphemyDataset(Dataset):
    def __init__(self, examples: list[TrainingExample], tokenizer: DistilBertTokenizer, max_length: int = 128):
        self.examples = examples
        self.tokenizer = tokenizer
        self.max_length = max_length

    def __len__(self) -> int:
        return len(self.examples)

    def __getitem__(self, idx: int) -> dict:
        ex = self.examples[idx]
        parts = []
        if ex.context_before:
            parts.append(ex.context_before)
        parts.append(ex.sentence)
        if ex.context_after:
            parts.append(ex.context_after)
        text = " [SEP] ".join(parts)
        encoding = self.tokenizer(text, max_length=self.max_length, padding="max_length", truncation=True, return_tensors="pt")
        return {
            "input_ids": encoding["input_ids"].squeeze(0),
            "attention_mask": encoding["attention_mask"].squeeze(0),
            "labels": torch.tensor(LABEL_TO_ID[ex.label], dtype=torch.long),
        }


def split_data(examples: list[TrainingExample], train_ratio=0.8, val_ratio=0.1, seed=42):
    rng = random.Random(seed)
    by_label: dict[str, list[TrainingExample]] = {}
    for ex in examples:
        by_label.setdefault(ex.label, []).append(ex)
    train, val, test = [], [], []
    for label_examples in by_label.values():
        rng.shuffle(label_examples)
        n = len(label_examples)
        n_train = max(1, int(n * train_ratio))
        n_val = max(1, int(n * val_ratio))
        train.extend(label_examples[:n_train])
        val.extend(label_examples[n_train:n_train + n_val])
        test.extend(label_examples[n_train + n_val:])
    rng.shuffle(train)
    rng.shuffle(val)
    rng.shuffle(test)
    return train, val, test


def score_model(model, data_loader, device, verbose=False):
    """Compute accuracy and per-class precision/recall/F1."""
    model.eval()  # note: model.eval sets inference mode, not code execution
    all_preds, all_labels = [], []
    with torch.no_grad():
        for batch in data_loader:
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            labels = batch["labels"].to(device)
            outputs = model(input_ids=input_ids, attention_mask=attention_mask)
            preds = outputs.logits.argmax(dim=-1)
            all_preds.extend(preds.cpu().tolist())
            all_labels.extend(labels.cpu().tolist())

    correct = sum(p == l for p, l in zip(all_preds, all_labels))
    accuracy = correct / len(all_labels) if all_labels else 0.0

    report: dict[str, dict[str, float]] = {}
    for label_id, label_name in ID_TO_LABEL.items():
        tp = sum(1 for p, l in zip(all_preds, all_labels) if p == label_id and l == label_id)
        fp = sum(1 for p, l in zip(all_preds, all_labels) if p == label_id and l != label_id)
        fn = sum(1 for p, l in zip(all_preds, all_labels) if p != label_id and l == label_id)
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
        report[label_name] = {"precision": round(precision, 3), "recall": round(recall, 3), "f1": round(f1, 3), "support": tp + fn}
        if verbose:
            print(f"  {label_name:>10}: P={precision:.1%} R={recall:.1%} F1={f1:.1%} (n={tp+fn})")
    return accuracy, report


def train_model(output_dir: str, epochs: int = 10, batch_size: int = 16, learning_rate: float = 2e-5, seed: int = 42):
    torch.manual_seed(seed)
    random.seed(seed)
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    print(f"[Train] Device: {device}")

    all_data = get_all_expanded_data()
    train_data, val_data, test_data = split_data(all_data, seed=seed)
    print(f"[Train] Split: train={len(train_data)}, val={len(val_data)}, test={len(test_data)}")

    tokenizer = DistilBertTokenizer.from_pretrained(MODEL_NAME)
    model = DistilBertForSequenceClassification.from_pretrained(MODEL_NAME, num_labels=len(LABELS)).to(device)

    train_dataset = BlasphemyDataset(train_data, tokenizer)
    val_dataset = BlasphemyDataset(val_data, tokenizer)
    test_dataset = BlasphemyDataset(test_data, tokenizer)
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=batch_size)
    test_loader = DataLoader(test_dataset, batch_size=batch_size)

    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate, weight_decay=0.01)
    total_steps = len(train_loader) * epochs
    scheduler = get_linear_schedule_with_warmup(optimizer, num_warmup_steps=int(total_steps * 0.1), num_training_steps=total_steps)

    best_val_acc = 0.0
    best_epoch = 0

    for epoch in range(epochs):
        model.train()
        total_loss, correct, total = 0.0, 0, 0
        for batch in train_loader:
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            labels = batch["labels"].to(device)
            outputs = model(input_ids=input_ids, attention_mask=attention_mask, labels=labels)
            loss = outputs.loss
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            scheduler.step()
            optimizer.zero_grad()
            total_loss += loss.item()
            preds = outputs.logits.argmax(dim=-1)
            correct += (preds == labels).sum().item()
            total += labels.size(0)

        train_acc = correct / total
        val_acc, _ = score_model(model, val_loader, device)
        print(f"[Epoch {epoch+1}/{epochs}] loss={total_loss/len(train_loader):.4f} train_acc={train_acc:.1%} val_acc={val_acc:.1%}")

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            best_epoch = epoch + 1
            os.makedirs(output_dir, exist_ok=True)
            model.save_pretrained(output_dir)
            tokenizer.save_pretrained(output_dir)

    print(f"\n[Train] Best val accuracy: {best_val_acc:.1%} at epoch {best_epoch}")

    # Test with best model
    model = DistilBertForSequenceClassification.from_pretrained(output_dir).to(device)
    test_acc, test_report = score_model(model, test_loader, device, verbose=True)
    print(f"[Test] Accuracy: {test_acc:.1%}")

    metadata = {
        "model_name": MODEL_NAME, "labels": LABELS,
        "train_size": len(train_data), "val_size": len(val_data), "test_size": len(test_data),
        "epochs": epochs, "best_epoch": best_epoch,
        "best_val_accuracy": round(best_val_acc, 4), "test_accuracy": round(test_acc, 4),
        "test_report": test_report,
    }
    with open(os.path.join(output_dir, "training_metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)
    return metadata


def test_model_interactive(model_dir: str):
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    tokenizer = DistilBertTokenizer.from_pretrained(model_dir)
    model = DistilBertForSequenceClassification.from_pretrained(model_dir).to(device)
    model.eval()  # inference mode

    test_sentences = [
        ("Oh my God, I am heartily sorry for having offended Thee.", "God"),
        ("Oh my God, that dress is amazing!", "God"),
        ("Jesus Christ is risen from the dead.", "Jesus Christ"),
        ("Jesus Christ, what is wrong with you?", "Jesus Christ"),
        ("God, if you're listening, please get us out of here.", "God"),
        ("God, this traffic is killing me.", "God"),
        ("Lord, hear our prayer.", "Lord"),
        ("Lord have mercy, this line is never going to move.", "Lord"),
        ("Dear God, please bring him home safely.", "God"),
        ("Dear God, not another meeting.", "God"),
    ]

    print("\n=== Classifier predictions ===")
    for sentence, term in test_sentences:
        encoding = tokenizer(sentence, max_length=128, padding="max_length", truncation=True, return_tensors="pt").to(device)
        with torch.no_grad():
            outputs = model(**encoding)
            probs = torch.softmax(outputs.logits, dim=-1)[0]
            pred_id = probs.argmax().item()
            pred_label = ID_TO_LABEL[pred_id]
            confidence = probs[pred_id].item()
        icon = {"reverent": "+", "neutral": "~", "profane": "-"}[pred_label]
        print(f"  [{icon}] {pred_label:>8} ({confidence:.0%}) | {sentence}")


def main():
    parser = argparse.ArgumentParser(description="Fine-tune blasphemy classifier")
    parser.add_argument("--output", "-o", type=str, default="./models/blasphemy-classifier")
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--lr", type=float, default=2e-5)
    parser.add_argument("--test-only", action="store_true")
    parser.add_argument("--model", type=str)
    args = parser.parse_args()

    if args.test_only:
        test_model_interactive(args.model or args.output)
    else:
        metadata = train_model(output_dir=args.output, epochs=args.epochs, batch_size=args.batch_size, learning_rate=args.lr)
        print(f"\nModel saved to {args.output}")
        print(json.dumps(metadata, indent=2))
        test_model_interactive(args.output)


if __name__ == "__main__":
    main()
