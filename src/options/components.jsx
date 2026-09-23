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
import { useEffect, useMemo, useRef, useState } from "react";

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

function filterSearchableOptions(options, query) {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	if (!normalizedQuery) {
		return options;
	}
	return options.filter((option) =>
		[option.label, option.value, ...(option.keywords || [])].some((candidate) =>
			candidate.toLocaleLowerCase().includes(normalizedQuery),
		),
	);
}

function SearchableSelect({
	id,
	invalid = false,
	label,
	name,
	note,
	onBlur,
	onValueChange,
	options,
	placeholder = "Search",
	required = false,
	value,
}) {
	const containerRef = useRef(null);
	const selected = options.find((option) => option.value === value);
	const selectedLabel = selected?.label || "";
	const [activeIndex, setActiveIndex] = useState(-1);
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState(selectedLabel);
	const [searchTerm, setSearchTerm] = useState("");
	const listId = `${id}-options`;
	const filteredOptions = useMemo(
		() => filterSearchableOptions(options, searchTerm),
		[options, searchTerm],
	);
	const disabled = options.length === 0;

	useEffect(() => {
		if (!open) {
			setQuery(selectedLabel);
		}
	}, [open, selectedLabel]);

	useEffect(() => {
		if (!open || activeIndex < 0) {
			return;
		}
		containerRef.current
			?.querySelector(`[data-index="${activeIndex}"]`)
			?.scrollIntoView?.({ block: "nearest" });
	}, [activeIndex, open]);

	useEffect(() => {
		if (!open) {
			return undefined;
		}
		function closeFromOutside(event) {
			if (!containerRef.current?.contains(event.target)) {
				setQuery(selectedLabel);
				setSearchTerm("");
				setOpen(false);
				setActiveIndex(-1);
			}
		}
		document.addEventListener("mousedown", closeFromOutside);
		return () => document.removeEventListener("mousedown", closeFromOutside);
	}, [open, selectedLabel]);

	function setInitialActiveIndex(items) {
		const selectedIndex = items.findIndex((option) => option.value === value);
		setActiveIndex(selectedIndex >= 0 ? selectedIndex : items.length ? 0 : -1);
	}

	function openPicker(input) {
		if (disabled) {
			return;
		}
		setOpen(true);
		setSearchTerm("");
		setInitialActiveIndex(options);
		input.select();
	}

	function closePicker(restoreSelection = false) {
		if (restoreSelection) {
			setQuery(selectedLabel);
		}
		setSearchTerm("");
		setOpen(false);
		setActiveIndex(-1);
	}

	function choose(option) {
		const changed = option.value !== value;
		setQuery(option.label);
		closePicker();
		if (changed) {
			onValueChange(option.value);
		}
	}

	function handleChange(event) {
		const next = event.target.value;
		const matches = filterSearchableOptions(options, next);
		setQuery(next);
		setSearchTerm(next);
		setOpen(true);
		setInitialActiveIndex(matches);
	}

	function handleKeyDown(event) {
		if (["ArrowDown", "ArrowUp"].includes(event.key)) {
			event.preventDefault();
			if (!open) {
				openPicker(event.currentTarget);
				return;
			}
			if (filteredOptions.length === 0) {
				return;
			}
			const direction = event.key === "ArrowDown" ? 1 : -1;
			setActiveIndex((current) =>
				current < 0
					? direction > 0
						? 0
						: filteredOptions.length - 1
					: (current + direction + filteredOptions.length) %
						filteredOptions.length,
			);
			return;
		}
		if (event.key === "Enter" && open) {
			event.preventDefault();
			const option = filteredOptions[activeIndex];
			if (option) {
				choose(option);
			}
			return;
		}
		if (event.key === "Escape" && open) {
			event.preventDefault();
			event.stopPropagation();
			closePicker(true);
		}
	}

	function handleBlur(event) {
		requestAnimationFrame(() => {
			if (!containerRef.current?.contains(document.activeElement)) {
				closePicker(true);
			}
		});
		onBlur?.(event);
	}

	return (
		<FieldLabel id={id} label={label} note={note}>
			{(noteId) => (
				<div className="searchable-select" ref={containerRef}>
					<input
						aria-activedescendant={
							open && activeIndex >= 0
								? `${listId}-option-${activeIndex}`
								: undefined
						}
						aria-autocomplete="list"
						aria-controls={listId}
						aria-describedby={
							[noteId, invalid ? "form-status" : ""]
								.filter(Boolean)
								.join(" ") || undefined
						}
						aria-expanded={open}
						aria-invalid={invalid || undefined}
						autoComplete="off"
						className="searchable-select-input"
						disabled={disabled}
						id={id}
						onBlur={handleBlur}
						onChange={handleChange}
						onClick={(event) => {
							if (!open) {
								openPicker(event.currentTarget);
							}
						}}
						onFocus={(event) => openPicker(event.currentTarget)}
						onKeyDown={handleKeyDown}
						placeholder={disabled ? "No options available" : placeholder}
						required={required}
						role="combobox"
						type="search"
						value={query}
					/>
					<select
						aria-hidden="true"
						id={`${id}-value`}
						name={name}
						onChange={(event) => onValueChange(event.target.value)}
						tabIndex={-1}
						value={value}
					>
						{options.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
					<div
						className="searchable-select-options"
						hidden={!open}
						id={listId}
						role="listbox"
					>
						{filteredOptions.length === 0 ? (
							<div
								aria-disabled="true"
								className="searchable-select-empty"
								role="option"
								tabIndex={-1}
							>
								No matches
							</div>
						) : (
							filteredOptions.map((option, index) => (
								<div
									aria-selected={option.value === value}
									className="searchable-select-option"
									data-active={index === activeIndex}
									data-index={index}
									id={`${listId}-option-${index}`}
									key={option.value}
									onMouseDown={(event) => {
										event.preventDefault();
										choose(option);
									}}
									role="option"
									tabIndex={-1}
								>
									{option.label}
								</div>
							))
						)}
					</div>
				</div>
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
	SearchableSelect,
	StatusBanner,
	StatusCard,
	TextAreaInput,
	TextInput,
};
