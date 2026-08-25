export const visualTemplates = [
  {
    id: "auto",
    label: "Auto",
    description: "AI chooses the best template for your content",
    image: null,
    aspectRatio: "9:16" as const,
    isAuto: true
  },
  {
    id: "luxury-office-city",
    label: "Luxury City Office",
    description: "Dark luxury office with city skyline view, gold frame",
    image: "/backgrounds/template-luxury-office-city.png",
    aspectRatio: "9:16" as const,
    promptHint: "Dark luxury penthouse office background, leather furniture, city skyline through floor-to-ceiling windows, warm ambient lighting, gold accents, professional setting"
  },
  {
    id: "luxury-office-transparent",
    label: "Luxury Office (Transparent)",
    description: "Same city office with transparent frame for overlay",
    image: "/backgrounds/template-luxury-office-transparent.jpg",
    aspectRatio: "9:16" as const,
    promptHint: "Dark luxury penthouse office background, leather furniture, city skyline, warm ambient lighting, gold frame border"
  },
  {
    id: "dark-bookshelf",
    label: "Dark Bookshelf",
    description: "Dark office with illuminated bookshelves, gold frame",
    image: "/backgrounds/template-dark-bookshelf.png",
    aspectRatio: "9:16" as const,
    promptHint: "Dark executive office with illuminated bookshelves, leather chairs, warm lamp lighting, sophisticated atmosphere, gold accents"
  },
  {
    id: "glass-office",
    label: "Glass Office",
    description: "Modern glass-walled office with city view, gold frame",
    image: "/backgrounds/template-glass-office.png",
    aspectRatio: "9:16" as const,
    promptHint: "Modern glass-walled conference room, leather office chairs, city lights in background, professional corporate setting, warm lighting"
  },
  {
    id: "split-horizontal",
    label: "Split Screen",
    description: "Two-panel layout with Caseclosedfl.com branding",
    image: "/backgrounds/template-split-horizontal.png",
    aspectRatio: "9:16" as const,
    promptHint: "Split screen layout, two horizontal panels, dark background with grid pattern, professional branding space"
  }
] as const;

export type VisualTemplateId = typeof visualTemplates[number]["id"];
