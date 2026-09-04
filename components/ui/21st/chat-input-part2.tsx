import React, { useState } from 'react';
import ClaudeChatInput from '../components/ui/claude-style-chat-input';
import { FileText, Loader2, Code, Archive } from 'lucide-react';

const Icons = {
    FileText,
    Loader2,
    Code,
    Archive
};

const ChatboxDemo = () => {
    const [messages, setMessages] = useState<string[]>([]);

    const handleSendMessage = (message: string, files: File[]) => {
        console.log('Sending message:', message);
        console.log('Attached files:', files);
        setMessages([...messages, message]);
    };

    const currentHour = new Date().getHours();
    let greeting = 'Good morning';
    if (currentHour >= 12 && currentHour < 18) {
        greeting = 'Good afternoon';
    } else if (currentHour >= 18) {
        greeting = 'Good evening';
    }

    const userName = 'Saify';

    return (
        <div className="min-h-screen w-full bg-[#fcfcf9] dark:bg-[#202123] flex flex-col items-center justify-center p-4 font-sans text-text-100 transition-colors duration-200">

            {/* Greeting Section */}
            <div className="w-full max-w-3xl mb-8 sm:mb-12 text-center animate-fade-in">
                <div className="w-24 h-24 mx-auto mb-6 flex items-center justify-center">
                    <img src="https://cdn.21st.dev/assets/mirror/68/6896117aefeca6a69a2ed98a88c9753acdb1e47b0d54b7b4fa63c7ab59e10f5b.png" alt="Logo" className="w-full h-full object-contain" />
                </div>
                <h1 className="text-3xl sm:text-4xl font-serif font-light text-text-200 mb-3 tracking-tight">
                    {greeting}, <span className="relative inline-block pb-2">
                        {userName}
                        <svg
                            className="absolute w-[140%] h-[20px] -bottom-1 -left-[5%] text-[#D97757]"
                            viewBox="0 0 140 24"
                            fill="none"
                            preserveAspectRatio="none"
                            aria-hidden="true"
                        >
                            <path
                                d="M6 16 Q 70 24, 134 14"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                fill="none"
                            />
                        </svg>
                    </span>
                </h1>
            </div>

            <ClaudeChatInput onSendMessage={handleSendMessage} />

            <div className="flex flex-wrap justify-center gap-2 mt-4 max-w-2xl mx-auto px-4">
                <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-text-300 bg-transparent border border-bg-300 dark:border-bg-300/50 rounded-full hover:bg-bg-200 hover:text-text-200 transition-colors duration-150">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                    Write
                </button>
                <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-text-300 bg-transparent border border-bg-300 dark:border-bg-300/50 rounded-full hover:bg-bg-200 hover:text-text-200 transition-colors duration-150">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c0 2.5 6 2.5 6 2.5s6 0 6-2.5v-5" />
                    </svg>
                    Learn
                </button>
                <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-text-300 bg-transparent border border-bg-300 dark:border-bg-300/50 rounded-full hover:bg-bg-200 hover:text-text-200 transition-colors duration-150">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
                    </svg>
                    Code
                </button>
                <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-text-300 bg-transparent border border-bg-300 dark:border-bg-300/50 rounded-full hover:bg-bg-200 hover:text-text-200 transition-colors duration-150">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                    Life stuff
                </button>
            </div>

            <div className="absolute bottom-4 text-xs text-text-400 font-sans opacity-60 hover:opacity-100 transition-opacity">
            </div>
        </div>
    );
};

export default ChatboxDemo;