import {
	CheckCircledIcon,
	ExclamationTriangleIcon,
	EyeClosedIcon,
	EyeOpenIcon,
	InfoCircledIcon,
} from "@radix-ui/react-icons";
import {
	Button,
	Callout,
	Card,
	Heading,
	IconButton,
	Text,
	TextArea,
	TextField,
} from "@radix-ui/themes";
import { useState } from "react";

function FormSection({
	children,
	className = "",
	description,
	icon: Icon,
	id,
	title,
}) {
	return (
		<section className={`form-section ${className}`} aria-labelledby={id}>
			<div className="form-section-heading">
				{Icon ? (
					<span className="section-icon">
						<Icon aria-hidden="true" />
					</span>
				) : null}
				<div>
					<Heading as="h2" id={id} className="form-section-title" size="3">
						{title}
					</Heading>
					{description ? (
						<Text as="p" className="field-note" size="2">
							{description}
						</Text>
					) : null}
				</div>
			</div>
			<div className="form-section-content">{children}</div>
		</section>
	);
}

function FieldLabel({ children, id, label, note }) {
	const noteId = note ? `${id}-note` : undefined;

	return (
		<div className="field">
			<Text
				as="label"
				htmlFor={id}
				className="field-label"
				size="2"
				weight="medium"
			>
				{label}
			</Text>
			{children(noteId)}
			{note ? (
				<Text as="span" className="field-note" id={noteId} size="1">
					{note}
				</Text>
			) : null}
		</div>
	);
}

function TextInput({ children, id, invalid = false, label, note, ...props }) {
	return (
		<FieldLabel id={id} label={label} note={note}>
			{(noteId) => (
				<TextField.Root
					{...props}
					aria-describedby={
						[noteId, invalid ? "form-status" : ""].filter(Boolean).join(" ") ||
						undefined
					}
					aria-invalid={invalid || undefined}
					id={id}
					size="3"
				>
					{children}
				</TextField.Root>
			)}
		</FieldLabel>
	);
}

function PasswordInput(props) {
	const [visible, setVisible] = useState(false);
	const Icon = visible ? EyeClosedIcon : EyeOpenIcon;

	return (
		<TextInput {...props} type={visible ? "text" : "password"}>
			<TextField.Slot side="right">
				<IconButton
					aria-controls={props.id}
					aria-label={visible ? "Hide API key" : "Show API key"}
					aria-pressed={visible}
					className="password-toggle"
					color="gray"
					onClick={() => setVisible((current) => !current)}
					type="button"
					variant="ghost"
				>
					<Icon aria-hidden="true" />
				</IconButton>
			</TextField.Slot>
		</TextInput>
	);
}

function NumberInput({ id, label, note, ...props }) {
	return (
		<TextInput {...props} id={id} label={label} note={note} type="number" />
	);
}

function TextAreaInput({ id, invalid = false, label, note, ...props }) {
	return (
		<FieldLabel id={id} label={label} note={note}>
			{(noteId) => (
				<TextArea
					{...props}
					aria-describedby={
						[noteId, invalid ? "form-status" : ""].filter(Boolean).join(" ") ||
						undefined
					}
					aria-invalid={invalid || undefined}
					id={id}
					size="3"
				/>
			)}
		</FieldLabel>
	);
}

function NativeSelect({ children, id, label, note, ...props }) {
	return (
		<FieldLabel id={id} label={label} note={note}>
			{(noteId) => (
				<select
					{...props}
					aria-describedby={noteId}
					className="native-select"
					id={id}
				>
					{children}
				</select>
			)}
		</FieldLabel>
	);
}

function CheckboxField({ checked, id, label, note, onChange }) {
	const noteId = note ? `${id}-note` : undefined;

	return (
		<label className="checkbox-field" htmlFor={id}>
			<span className="checkbox-control">
				<input
					aria-describedby={noteId}
					checked={checked}
					id={id}
					onChange={onChange}
					type="checkbox"
				/>
				<Text as="span" size="2" weight="medium">
					{label}
				</Text>
			</span>
			{note ? (
				<Text as="span" className="field-note" id={noteId} size="1">
					{note}
				</Text>
			) : null}
		</label>
	);
}

function StatusCard({ children, title }) {
	return (
		<Card className="status-card" size="2">
			<Heading as="h3" size="2">
				{title}
			</Heading>
			{children}
		</Card>
	);
}

function StatusBanner({ banner }) {
	const tone = banner?.tone || "gray";
	const Icon =
		tone === "red"
			? ExclamationTriangleIcon
			: tone === "green"
				? CheckCircledIcon
				: InfoCircledIcon;

	return (
		<Callout.Root
			aria-live={tone === "red" ? "assertive" : "polite"}
			className="status-banner"
			color={tone}
			highContrast
			hidden={!banner}
			id="form-status"
			role={tone === "red" ? "alert" : "status"}
			size="1"
		>
			<Callout.Icon>
				<Icon aria-hidden="true" />
			</Callout.Icon>
			<Callout.Text>{banner?.message || ""}</Callout.Text>
		</Callout.Root>
	);
}

export {
	Button,
	CheckboxField,
	FieldLabel,
	FormSection,
	NativeSelect,
	NumberInput,
	PasswordInput,
	StatusBanner,
	StatusCard,
	TextAreaInput,
	TextInput,
};
